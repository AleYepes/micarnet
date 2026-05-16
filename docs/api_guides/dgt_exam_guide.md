```
import json
import pandas as pd
from playwright.sync_api import sync_playwright

def safe_json_parse(response_body):
    try:
        return json.loads(response_body.decode('utf-8'))
    except UnicodeDecodeError:
        try:
            return json.loads(response_body.decode('iso-8859-1'))
        except Exception:
            return {}

def scrape_dgt_extended():
    url = "https://www.dgt.es/conoce-la-dgt/con-quien-trabajamos/autoescuelas/"

    all_schools = []
    all_municipalities = []
    all_provinces = []
    all_ccaa = []

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=False)
        page = browser.new_page()

        print("Navigating to DGT...")
        page.goto(url)
        page.wait_for_load_state("networkidle")

        selector = "select.provinciaMap"
        page.wait_for_selector(selector)

        options_handle = page.locator(f"{selector} option").all()
        provinces_metadata = []
        ccaa_set = {}

        for opt in options_handle:
            txt = opt.text_content()
            if txt and "Selecciona" not in txt:
                ccaa_id = opt.get_attribute("data-ccaaid")
                provinces_metadata.append({
                    "nombre": txt,
                    "data_provid": opt.get_attribute("data-provid"),
                    "objectid_prov": opt.get_attribute("objectid-prov"),
                    "ccaa_id": ccaa_id,
                    "objectid_ccaa": opt.get_attribute("objectid-ccaa"),
                    "ccaa_nombre": opt.get_attribute("data-nameccaa")
                })

                if ccaa_id and ccaa_id not in ccaa_set:
                    ccaa_set[ccaa_id] = {
                        "ccaa_id": ccaa_id,
                        "objectid_ccaa": opt.get_attribute("objectid-ccaa"),
                        "nombre": opt.get_attribute("data-nameccaa")
                    }

        all_ccaa = list(ccaa_set.values())
        print(f"Found {len(provinces_metadata)} provinces and {len(all_ccaa)} autonomous communities.")

        for prov_meta in provinces_metadata:
            prov_name = prov_meta["nombre"]
            print(f"--- Processing: {prov_name} ---")

            is_school_req = lambda r: "Autoescuela_pre/FeatureServer/0/query" in r.url and "f=pjson" in r.url

            is_prov_geo_req = lambda r: (
                "Limite_admin_prov/FeatureServer/0/query" in r.url
                and "returnGeometry=true" in r.url
                and "returnExtentOnly=true" not in r.url
            )

            is_extent_req = lambda r: (
                "Limite_admin_prov/FeatureServer/0/query" in r.url
                and "returnExtentOnly=true" in r.url
            )

            is_muni_req = lambda r: "Limite_admin_muni/FeatureServer/0/query" in r.url

            try:
                with page.expect_response(is_school_req, timeout=10000) as school_resp, \
                     page.expect_response(is_prov_geo_req, timeout=10000) as prov_resp, \
                     page.expect_response(is_extent_req, timeout=10000) as extent_resp, \
                     page.expect_response(is_muni_req, timeout=10000) as muni_resp:

                    page.select_option(selector, label=prov_name)

                s_data = safe_json_parse(school_resp.value.body())
                if 'features' in s_data:
                    print(f"   > Schools: {len(s_data['features'])}")
                    for feat in s_data['features']:
                        attr = feat.get('attributes', {})
                        all_schools.append({
                            "codigo_centro": attr.get('codigo_centro'),
                            "internal_id": attr.get('id'),
                            "object_id": attr.get('OBJECTID'),
                            "name": attr.get('nombre'),
                            # "type": attr.get('tipo_elemento'),
                            "address": attr.get('direccion'),
                            "zip_code": attr.get('codigo_postal'),
                            "municipality_text": attr.get('municipio'),
                            "province_text": attr.get('provincia'),
                            "comunidad_text": attr.get('comunidad'),
                            "province_ine": attr.get('cod_ine'),
                            "latitude": attr.get('latitud'),
                            "longitude": attr.get('longitud'),
                            "phone": attr.get('telefono'),
                            "mobile": attr.get('movil'),
                            # "fax": attr.get('fax'),
                            "email": attr.get('email'),
                            "website": attr.get('web'),
                            "licenses": attr.get('info').strip(),
                            # "extra1": attr.get('extra1'),
                            # "extra2": attr.get('extra2')
                        })

                p_data = safe_json_parse(prov_resp.value.body())
                extent_data = safe_json_parse(extent_resp.value.body())

                extent_xmin = None
                extent_ymin = None
                extent_xmax = None
                extent_ymax = None

                if 'extent' in extent_data:
                    ext = extent_data['extent']
                    extent_xmin = ext.get('xmin')
                    extent_ymin = ext.get('ymin')
                    extent_xmax = ext.get('xmax')
                    extent_ymax = ext.get('ymax')

                if 'features' in p_data and len(p_data['features']) > 0:
                    feat = p_data['features'][0]
                    attr = feat.get('attributes', {})
                    geo = feat.get('geometry', {})

                    rings_json = json.dumps(geo.get('rings', []))

                    all_provinces.append({
                        "nombre": attr.get('NAMEUNIT', prov_name),
                        "data_provid": prov_meta["data_provid"],
                        "objectid_prov": prov_meta["objectid_prov"],
                        "ccaa_id": prov_meta["ccaa_id"],
                        "objectid_ccaa": prov_meta["objectid_ccaa"],
                        "ccaa_nombre": prov_meta["ccaa_nombre"],
                        "geometry_rings": rings_json,
                        # "spatial_reference": geo.get('spatialReference', {}).get('latestWkid'),
                        "extent_xmin": extent_xmin,
                        "extent_ymin": extent_ymin,
                        "extent_xmax": extent_xmax,
                        "extent_ymax": extent_ymax
                    })

                m_data = safe_json_parse(muni_resp.value.body())
                if 'features' in m_data:
                    print(f"   > Municipalities: {len(m_data['features'])}")
                    for feat in m_data['features']:
                        attr = feat.get('attributes', {})
                        all_municipalities.append({
                            "cod_ine": attr.get('COD_INE'),
                            "name": attr.get('NAMEUNIT'),
                            "shape_area": attr.get('Shape__Area'),
                            "shape_length": attr.get('Shape__Length'),
                            "object_id": attr.get('OBJECTID')
                        })

            except Exception as e:
                print(f"   ! Timeout or error processing {prov_name}: {e}")
                continue

            page.wait_for_timeout(500)


        browser.close()

    print("\nSaving to CSV...")

    df_ccaa = pd.DataFrame(all_ccaa)
    if not df_ccaa.empty:
        df_ccaa.drop_duplicates(subset=['ccaa_id'], inplace=True)
        df_ccaa.to_csv("data/comunidades.csv", index=False, encoding='utf-8')
        print(f"Saved {len(df_ccaa)} autonomous communities to data/comunidades.csv")

    df_prov = pd.DataFrame(all_provinces)
    if not df_prov.empty:
        df_prov.drop_duplicates(subset=['objectid_prov'], inplace=True)
        df_prov.to_csv("data/provinces.csv", index=False, encoding='utf-8')
        print(f"Saved {len(df_prov)} provinces to data/provinces.csv")

    df_muni = pd.DataFrame(all_municipalities)
    if not df_muni.empty:
        df_muni = df_muni[df_muni['cod_ine'].notna()]
        df_muni.drop_duplicates(subset=['cod_ine'], inplace=True)
        df_muni.to_csv("data/municipalities.csv", index=False, encoding='utf-8')
        print(f"Saved {len(df_muni)} municipalities to data/municipalities.csv")

    df_schools = pd.DataFrame(all_schools)
    if not df_schools.empty:
        df_schools.drop_duplicates(subset=['codigo_centro'], inplace=True)
        df_schools.to_csv("data/schools.csv", index=False, encoding='utf-8')
        print(f"Saved {len(df_schools)} schools to data/schools.csv")

if __name__ == "__main__":
    scrape_dgt_extended()
```

The worker app has code for official locations, unofficial neighborhoods and polygons, NIE stats and registered DGT school establishments and companies. Now it's time to download the exam data. I found a source for this (https://www.dgt.es/menusecundario/dgt-en-cifras/matraba-listados/conductores-autoescuelas.html). It lists of a bunch of anchor tags to zip files, each containing exam data for a given month over the last ~15 years. Each zip file seem to contain only one txt file with comma separated values encoded with latin1. I manually downloaded and decompressed the txt file to sample the contents. They look like:

```
DESC_PROVINCIA;CENTRO_EXAMEN;CODIGO_AUTOESCUELA;NOMBRE_AUTOESCUELA;CODIGO_SECCION;MES;ANYO;TIPO_EXAMEN;NOMBRE_PERMISO;NUM_APTOS;NUM_APTOS_1conv;NUM_APTOS_2conv;NUM_APTOS_3o4conv;NUM_APTOS_5_o_mas_conv;NUM_NO_APTOS
Albacete;Albacete;AB0168;ALBA;01;1 ;2010;PRUEBA ESPEC�FICO;LCC;4;4;0;0;0;0
Albacete;Albacete;AB0168;ALBA;01;1 ;2010;PRUEBA TE�RICA;B  ;5;3;1;1;0;9
Albacete;Albacete;AB0168;ALBA;01;1 ;2010;PRUEBA CONDUCCI�N Y CIRCULACI�N;B  ;11;7;1;3;0;7
Albacete;Albacete;AB0081;ALMANSA S L;01;1 ;2010;PRUEBA CONDUCCI�N Y CIRCULACI�N;C  ;1;1;0;0;0;0
Albacete;Albacete;AB0081;ALMANSA S L;01;1 ;2010;PRUEBA DESTREZA;C  ;1;1;0;0;0;0
...
```

We want to concatenate all the exam files into one long table. The schema is roughly set up as an 'exam_stats' table, but we want to make sure it corresponds with the incoming data. Unfortunately, the 'CODIGO_AUTOESCUELA' values are supposed to correspond with the dgt_school_code values in the schools table (and the 'CODIGO_SECCION' are supposed to match with the dgt_section_code), but looking at the table generated by @fetch-dgt-schools.ts, it seems they don't match exactly. For some reason the existing dgt_school_code values separate the inital alphabetic part of the code from the later numerical part of the code. Read @fetch-dgt-schools.ts to review if this is the case. In any case, we will need these values to join the new exams table with our schools table, so we'll have to sort this out.

One potential issue we may face in the future is that the current schema doesn't set dgt_school_code, dgt_section_code, or dgt_id (the combination of the two) as the schools primary key, or a unique columnn for that matter, so we will want to address this. I'm not sure if it's wise to set external data as the PK in our table, but it would save a few columns worth of space. What would you suggest?

As for the general logic of the code, I drafted a very rough bit of python code in @exam_scraper.py to give you an idea of the html DOM. It clearly uses CSVs instead of a postgres db, so it rather incompatible with the existing repo. Don't follow it religiously, just use it to orient yourself around the incoming txt files.
