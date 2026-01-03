import json
import pandas as pd
import os
from playwright.sync_api import sync_playwright

def safe_json_parse(response_body):
    try:
        return json.loads(response_body.decode('utf-8'))
    except UnicodeDecodeError:
        try:
            return json.loads(response_body.decode('iso-8859-1'))
        except Exception:
            return {}
        
def save(dict_list, filename):
    df = pd.DataFrame(dict_list)
    if not df.empty:
        df.drop_duplicates(subset=['id'], inplace=True)
        df.to_csv(filename, index=False, encoding='utf-8')

def scrape_dgt_autoescuelas():
    
    all_communities = []
    all_provinces = []
    all_municipalities = []
    all_schools = []

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=False)
        page = browser.new_page()
        page.route("**/*.{png,jpg,jpeg,svg,woff,woff2}", lambda route: route.abort())

        url = "https://www.dgt.es/conoce-la-dgt/con-quien-trabajamos/autoescuelas/"
        page.goto(url)
        try:
            page.wait_for_load_state("networkidle", timeout=10000)
        except:
            pass 
        
        selector = "select.provinciaMap"
        page.wait_for_selector(selector)

        province_dropdown_options = page.locator(f"{selector} option").all()
        communities_set = {}
        for dropdown_option in province_dropdown_options:
            txt = dropdown_option.text_content()
            if txt:
                community_id = dropdown_option.get_attribute("data-ccaaid")
                if community_id:
                    if community_id not in communities_set:
                        communities_set[community_id] = {
                            "id": community_id,
                            "name": dropdown_option.get_attribute("data-nameccaa")
                        }
                    all_provinces.append({
                        "id": dropdown_option.get_attribute("data-provid"),
                        "name": txt,
                        "community_id": community_id,
                    }) 
        all_communities = list(communities_set.values())
        
        for province_data in all_provinces:
            prov_name = province_data["name"]
            prov_id = int(province_data["id"])

            prov_id_padded = f"{prov_id:02d}"
            prov_id_unpadded = str(prov_id)
            muni_url_pattern = f"%29%3D%27{prov_id_padded}%27" 
            school_url_pattern = f"cod_ine%3D%27{prov_id_unpadded}%27"

            municipalities_request = lambda r: "Limite_admin_muni/FeatureServer/0/query" in r.url and muni_url_pattern in r.url
            schools_request = lambda r: "Autoescuela_pre/FeatureServer/0/query" in r.url and school_url_pattern in r.url

            try:
                with page.expect_response(schools_request, timeout=10000) as school_response, \
                     page.expect_response(municipalities_request, timeout=10000) as municipalities_response:
                    
                    page.select_option(selector, label=prov_name)
                
                municipalities_resource = safe_json_parse(municipalities_response.value.body())
                if 'features' in municipalities_resource:
                    for feat in municipalities_resource['features']:
                        attr = feat.get('attributes', {})
                        json_prov_id_padded = attr.get('COD_INE', '00')[:2]
                        if json_prov_id_padded != prov_id_padded:
                            continue
                        all_municipalities.append({
                            "id": attr.get('COD_INE', ''),
                            "name": attr.get('NAMEUNIT', ''),
                            "province_id": json_prov_id_padded,
                        })

                school_resource = safe_json_parse(school_response.value.body())
                if 'features' in school_resource:
                    for feat in school_resource['features']:
                        attr = feat.get('attributes', {})
                        json_province_id = int(attr.get('cod_ine'))
                        if json_province_id != prov_id:
                            continue
                        if attr.get('info', ''):
                            licenses = [license.strip() for license in attr.get('info').split(' ') if license.strip()]
                        else:
                            licenses = []
                        all_schools.append({
                            "id": attr.get('codigo_centro', ''),
                            "name": attr.get('nombre', ''),
                            "address": attr.get('direccion', ''),
                            "zip_code": attr.get('codigo_postal', ''),
                            "municipality_name": attr.get('municipio', ''),
                            "province_id": attr.get('cod_ine', ''),
                            "province_name": attr.get('provincia', ''),
                            "community_id": province_data["community_id"],
                            "comunidad_name": attr.get('comunidad', ''),
                            "latitude": attr.get('latitud', ''),
                            "longitude": attr.get('longitud', ''),
                            "phone": attr.get('telefono', ''),
                            "mobile": attr.get('movil', ''),
                            "email": attr.get('email', ''),
                            "website": attr.get('web', ''),
                            "licenses": ';'.join(licenses)
                        })

            except Exception as e:
                print(f"   Error processing {prov_name}: {e}")
                raise

        browser.close()

    output_dir = "data"
    os.makedirs(output_dir, exist_ok=True)

    save(all_communities, output_dir + "/communities.csv")
    save(all_provinces, output_dir + "/provinces.csv")
    save(all_municipalities, output_dir + "/municipalities.csv")
    save(all_schools, output_dir + "/schools.csv")

if __name__ == "__main__":
    scrape_dgt_autoescuelas()