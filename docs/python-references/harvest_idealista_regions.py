import argparse
import asyncio
import json
import re
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

from playwright.async_api import async_playwright


START_URL = "https://www.idealista.com/busqueda-multizona/venta-viviendas"
USER_DATA_DIR = Path("user_data")
DEFAULT_OUTPUT_DIR = Path("data/idealista_harvest")
TREE_URL = "https://mt1.idealista.com/11/tree/all-es-tree.json"
PATH_URL = "https://mt1.idealista.com/11/paths/es/{short_uri}"
ZOOMS_URL = "https://mt1.idealista.com/11/zooms/es/{short_uri}.json"
LABELS_URL = (
    "https://www.idealista.com/es/multizoneSearcherLocationTotals"
    "?locationShortUris={short_uris}&operation=1&typology=1"
)
USER_AGENT = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36"
)
RING_RE = re.compile(r"\({2,}(.*?)\){2,}")
RING_SEPARATOR_RE = re.compile(r"\)+\(+")


def fetch_bytes(url: str, timeout: int = 30) -> bytes:
    request = Request(url, headers={"User-Agent": USER_AGENT, "Accept": "*/*"})
    with urlopen(request, timeout=timeout) as response:
        return response.read()


def fetch_json(url: str) -> Any:
    return json.loads(fetch_bytes(url).decode("utf-8"))


def flatten_tree(nodes: list[dict[str, Any]]) -> dict[str, dict[str, Any]]:
    regions: dict[str, dict[str, Any]] = {}

    def walk(items: list[dict[str, Any]], depth: int, parent: str | None) -> None:
        for item in items:
            short_uri = item["id"]
            children = item.get("children", [])
            regions[short_uri] = {
                "shortUri": short_uri,
                "tree_depth": depth,
                "parent_shortUri": parent,
                "children_shortUris": [child["id"] for child in children],
            }
            walk(children, depth + 1, short_uri)

    walk(nodes, 0, None)
    return regions


def decode_polyline(encoded: str) -> list[list[float]]:
    coords: list[list[float]] = []
    index = lat = lng = 0

    while index < len(encoded):
        lat_delta, index = decode_polyline_value(encoded, index)
        lng_delta, index = decode_polyline_value(encoded, index)
        lat += lat_delta
        lng += lng_delta
        coords.append([lng / 1e5, lat / 1e5])

    return coords


def decode_polyline_value(encoded: str, index: int) -> tuple[int, int]:
    result = shift = 0
    while True:
        byte = ord(encoded[index]) - 63
        index += 1
        result |= (byte & 0x1F) << shift
        shift += 5
        if byte < 0x20:
            break
    value = ~(result >> 1) if result & 1 else result >> 1
    return value, index


def decode_idealista_geometry(raw_geometry: str) -> list[list[list[float]]]:
    rings: list[list[list[float]]] = []
    for match in RING_RE.finditer(raw_geometry):
        for encoded_ring in RING_SEPARATOR_RE.split(match.group(1)):
            if not encoded_ring:
                continue
            ring = decode_polyline(encoded_ring)
            if ring and ring[0] != ring[-1]:
                ring.append(ring[0])
            if ring:
                rings.append(ring)
    return rings


def rings_to_geojson_geometry(rings: list[list[list[float]]]) -> dict[str, Any] | None:
    if not rings:
        return None
    if len(rings) == 1:
        return {"type": "Polygon", "coordinates": [rings[0]]}
    return {"type": "MultiPolygon", "coordinates": [[ring] for ring in rings]}


def chunked(items: list[str], size: int) -> list[list[str]]:
    return [items[index : index + size] for index in range(0, len(items), size)]


async def fetch_labels_with_browser(short_uris: list[str], batch_size: int) -> dict[str, Any]:
    labels: dict[str, Any] = {}
    batches = chunked(short_uris, batch_size)

    async with async_playwright() as playwright:
        context = await playwright.chromium.launch_persistent_context(
            user_data_dir=str(USER_DATA_DIR),
            channel="chrome",
            headless=False,
            args=[
                "--disable-blink-features=AutomationControlled",
                "--start-maximized",
                "--no-sandbox",
            ],
            ignore_default_args=["--enable-automation"],
            viewport=None,
            user_agent=USER_AGENT,
        )
        page = context.pages[0] if context.pages else await context.new_page()
        await page.add_init_script(
            """
            Object.defineProperty(navigator, 'webdriver', {
                get: () => undefined
            });
            """
        )

        await page.goto(START_URL, wait_until="domcontentloaded", timeout=60000)
        print("Browser opened for labels. Solve any challenge if shown; fetching starts in 10 seconds.")
        await asyncio.sleep(10)

        for index, batch in enumerate(batches, start=1):
            url = LABELS_URL.format(short_uris=",".join(batch))
            try:
                data = await page.evaluate(
                    """
                    async (url) => {
                        const response = await fetch(url, {
                            headers: {Accept: "application/json,text/plain,*/*"}
                        });
                        if (!response.ok) {
                            return {__error: `${response.status} ${response.statusText}`};
                        }
                        return await response.json();
                    }
                    """,
                    url,
                )
            except Exception as exc:
                print(f"Label batch {index}/{len(batches)} failed: {exc}")
                continue

            if isinstance(data, dict) and "__error" in data:
                print(f"Label batch {index}/{len(batches)} failed: {data['__error']}")
                continue

            labels.update(data)
            print(f"Fetched labels batch {index}/{len(batches)} ({len(labels)} labels total)")
            await asyncio.sleep(0.2)

        await context.close()

    return labels


def fetch_one_region(short_uri: str) -> tuple[str, dict[str, Any]]:
    result: dict[str, Any] = {}

    try:
        raw_geometry = fetch_bytes(PATH_URL.format(short_uri=short_uri)).decode("utf-8")
        result["geometry_raw"] = raw_geometry
    except (HTTPError, URLError, TimeoutError, UnicodeDecodeError) as exc:
        result["geometry_fetch_error"] = str(exc)
    else:
        try:
            rings = decode_idealista_geometry(raw_geometry)
            result["rings"] = rings
            result["ring_count"] = len(rings)
        except IndexError as exc:
            result["geometry_decode_error"] = str(exc)
            result["ring_count"] = 0

    try:
        result["zooms"] = fetch_json(ZOOMS_URL.format(short_uri=short_uri))
    except (HTTPError, URLError, TimeoutError, json.JSONDecodeError) as exc:
        result["zooms_error"] = str(exc)

    return short_uri, result

def fetch_paths_and_zooms(short_uris: list[str], workers: int) -> dict[str, dict[str, Any]]:
    results: dict[str, dict[str, Any]] = {}
    with ThreadPoolExecutor(max_workers=workers) as executor:
        future_to_uri = {executor.submit(fetch_one_region, short_uri): short_uri for short_uri in short_uris}
        for count, future in enumerate(as_completed(future_to_uri), start=1):
            short_uri, data = future.result()
            results[short_uri] = data
            if count % 250 == 0 or count == len(short_uris):
                print(f"Fetched paths/zooms for {count}/{len(short_uris)} regions")
    return results


def write_jsonl(path: Path, records: list[dict[str, Any]]) -> None:
    with path.open("w", encoding="utf-8") as handle:
        for record in records:
            handle.write(json.dumps(record, ensure_ascii=False, sort_keys=True) + "\n")


def write_geojson(path: Path, records: list[dict[str, Any]]) -> None:
    features = []
    for record in records:
        geometry = rings_to_geojson_geometry(record.get("rings") or [])
        if geometry is None:
            continue
        properties = {
            key: value
            for key, value in record.items()
            if key not in {"rings", "geometry_raw", "children_shortUris"}
        }
        features.append({"type": "Feature", "properties": properties, "geometry": geometry})
    path.write_text(
        json.dumps({"type": "FeatureCollection", "features": features}, ensure_ascii=False),
        encoding="utf-8",
    )


async def main() -> None:
    args = parse_args()
    args.output_dir.mkdir(parents=True, exist_ok=True)

    print("Fetching region tree...")
    tree = fetch_json(TREE_URL)
    regions = flatten_tree(tree)
    short_uris = sorted(regions)
    if args.limit:
        short_uris = short_uris[: args.limit]
    print(f"Tree contains {len(regions)} regions; harvesting {len(short_uris)}.")

    labels: dict[str, Any] = {}
    if not args.skip_labels:
        labels = await fetch_labels_with_browser(short_uris, args.label_batch_size)

    path_data: dict[str, dict[str, Any]] = {}
    if not args.skip_paths:
        path_data = fetch_paths_and_zooms(short_uris, args.workers)

    records = []
    for short_uri in short_uris:
        label = labels.get(short_uri, {})
        record = {
            **regions[short_uri],
            "name": label.get("name"),
            "parentName": label.get("parentName"),
            "total": label.get("total"),
            **path_data.get(short_uri, {}),
        }
        records.append(record)

    stamp = time.strftime("%Y%m%d_%H%M%S")
    tree_path = args.output_dir / f"tree_{stamp}.json"
    labels_path = args.output_dir / f"labels_{stamp}.json"
    jsonl_path = args.output_dir / f"regions_{stamp}.jsonl"
    geojson_path = args.output_dir / f"regions_{stamp}.geojson"

    tree_path.write_text(json.dumps(tree, ensure_ascii=False), encoding="utf-8")
    labels_path.write_text(json.dumps(labels, ensure_ascii=False, sort_keys=True), encoding="utf-8")
    write_jsonl(jsonl_path, records)
    write_geojson(geojson_path, records)

    print(f"Saved tree: {tree_path}")
    print(f"Saved labels: {labels_path}")
    print(f"Saved JSONL regions: {jsonl_path}")
    print(f"Saved GeoJSON regions: {geojson_path}")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Harvest Idealista multizone regions from public map endpoints.")
    parser.add_argument("--output-dir", type=Path, default=DEFAULT_OUTPUT_DIR)
    parser.add_argument("--limit", type=int, help="Limit number of shortUris for testing.")
    parser.add_argument("--workers", type=int, default=16, help="Concurrent workers for CloudFront path/zoom fetches.")
    parser.add_argument("--label-batch-size", type=int, default=100)
    parser.add_argument("--skip-labels", action="store_true")
    parser.add_argument("--skip-paths", action="store_true")
    return parser.parse_args()


if __name__ == "__main__":
    asyncio.run(main())
