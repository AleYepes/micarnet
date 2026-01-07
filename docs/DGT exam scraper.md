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

I want to elaborate this data with some more dgt metrics. I found this (https://www.dgt.es/menusecundario/dgt-en-cifras/dgt-en-cifras-resultados/dgt-en-cifras-detalle/Microdatos-de-examenes-por-Seccion-Autoescuela-mensual/). It leads to a page listing a bunch of zip files, each containing exam data for a given month over the last ~15 years, and to a pdf that describes the schema of the txt files in the zip files. Each zip file seem to contain only one txt file with csv-like data, but separated with ";" and encoded with latin1. I manually downloaded, decompressed the txt file, and loaded it with `df = pd.read_csv("data/export_auto_20251101_20251130.txt", sep=";", encoding="latin1")`.

It has these columns:
Index(['DESC_PROVINCIA', 'CENTRO_EXAMEN', 'CODIGO_AUTOESCUELA',
'NOMBRE_AUTOESCUELA', 'CODIGO_SECCION', 'MES', 'ANYO', 'TIPO_EXAMEN',
'NOMBRE_PERMISO', 'NUM_APTOS', 'NUM_APTOS_1conv', 'NUM_APTOS_2conv',
'NUM_APTOS_3o4conv', 'NUM_APTOS_5_o_mas_conv', 'NUM_NO_APTOS'],
dtype='object')

And the values look like:
"""
DESC_PROVINCIA;CENTRO_EXAMEN;CODIGO_AUTOESCUELA;NOMBRE_AUTOESCUELA;CODIGO_SECCION;MES;ANYO;TIPO_EXAMEN;NOMBRE_PERMISO;NUM_APTOS;NUM_APTOS_1conv;NUM_APTOS_2conv;NUM_APTOS_3o4conv;NUM_APTOS_5_o_mas_conv;NUM_NO_APTOS
Albacete;Albacete;AB0198;ALARCON;01;11;2025;PRUEBA TE�RICA;B ;9;8;1;0;0;7
Albacete;Albacete;AB0198;ALARCON;01;11;2025;PRUEBA TE�RICA;A2 ;1;1;0;0;0;0
Albacete;Albacete;AB0198;ALARCON;01;11;2025;PRUEBA CONDUCCI�N Y CIRCULACI�N;B ;8;5;3;0;0;4
Albacete;Albacete;AB0198;ALARCON;01;11;2025;PRUEBA ESPEC�FICO;A2 ;1;1;0;0;0;0
Albacete;Albacete;AB0220;ALBA;01;11;2025;PRUEBA TE�RICA;B ;6;4;1;1;0;10
Albacete;Albacete;AB0220;ALBA;01;11;2025;PRUEBA ESPEC�FICO;EC ;3;3;0;0;0;0
"""

Unfortunately the 'CODIGO_AUTOESCUELA' doesn't exactly match those extracted from the json resources in the code above.
The json data use 8 digit codes, like 'AB018901', where as the zip data uses 6 digit codes, like 'AB0189'. I figure the last 2 digits distinguish between different offices under the same autoescuela company, so we might be able to join the original schools.csv with the new zip data using the txt 'DESC_PROVINCIA', 'CENTRO_EXAMEN', and 'CODIGO_SECCION' cols, particularly the 'CODIGO_SECCION' which seems to match the last 2 digits, however, often with mistakes.

For example, the following snippets of code show that there are discrepensies in the txt data and the scraped schools data:

```
schools = pd.read_csv('data/schools.csv')
schools = schools.dropna(subset='codigo_centro')
print(schools[schools['codigo_centro'].str.startswith('AB0189')][['codigo_centro', 'municipality_text', 'province_text']])
```

"""
codigo_centro municipality_text province_text
0 AB018901 ALBACETE ALBACETE
1 AB018902 CHINCHILLA ALBACETE
2 AB018903 VILLARROBLEDO ALBACETE
"""

```
df = pd.read_csv("data/export_auto_20251101_20251130.txt", sep=";", encoding="latin1")
print(df[df['CODIGO_AUTOESCUELA'] == 'AB0189'][['DESC_PROVINCIA', 'CENTRO_EXAMEN', 'CODIGO_AUTOESCUELA', 'CODIGO_SECCION']])
```

"""
DESC_PROVINCIA CENTRO_EXAMEN \
193 Albacete Albacete  
194 Albacete Albacete  
195 Albacete Albacete  
196 Albacete Albacete  
197 Albacete Albacete  
198 Albacete Albacete  
199 Albacete Albacete  
200 Albacete Albacete  
201 Albacete Albacete  
202 Albacete Albacete  
257 Albacete Albacete ( municipio sin especificar)  
467 Albacete Villarrobledo  
468 Albacete Villarrobledo  
469 Albacete Villarrobledo  
27697 N.D. N.D.  
27698 N.D. N.D.  
27699 N.D. N.D.  
27700 N.D. N.D.  
27701 N.D. N.D.

      CODIGO_AUTOESCUELA CODIGO_SECCION

193 AB0189 01  
194 AB0189 01  
195 AB0189 01  
196 AB0189 01  
197 AB0189 01  
198 AB0189 01  
199 AB0189 01  
200 AB0189 01  
201 AB0189 01  
202 AB0189 01  
257 AB0189 01  
467 AB0189 03  
468 AB0189 03  
469 AB0189 03  
27697 AB0189 01  
27698 AB0189 01  
27699 AB0189 01  
27700 AB0189 01  
27701 AB0189 01  
"""

So, I will need to explore all the ways the new txt data varies from the json data. I trust the json data, what's stored in csvs, more since it's successfully passed to places API to render a map.

In any case, before all that, I will have to fetch all the data from the list of links first (https://www.dgt.es/menusecundario/dgt-en-cifras/matraba-listados/conductores-autoescuelas.html), and organize it into a cleaner sytem/database catalog to avoid wasting memory.

Currently none of the csv reference each other, which they should, as should the new txt data, but let's start with a way to download and extract all the monthly zip files. Do not write any comments. Let the code speak for itself.
