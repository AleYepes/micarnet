import os
import pandas as pd
from pyrosm import OSM
import json
import re
from rapidfuzz import process, fuzz

def keep_row(row, ccaa_id, prov_ids, mun_ids):
    try:
        tags = json.loads(row["tags"])
    except Exception:
        return False

    if int(row["admin_level"]) <= 8 and not any(k.startswith("ine:") for k in tags):
        return False

    if int(row["admin_level"]) > 10:
        return False
    
    if not int(tags.get("ine:ccaa", ccaa_id)) == ccaa_id:
        return False
    
    if not int(tags.get("ine:provincia", prov_ids[0])) in prov_ids:
        return False

    if not int(tags.get("ine:municipio", mun_ids[0])) in mun_ids:
        return False

    return True

import unicodedata


def normalize_text(text):
    if not isinstance(text, str):
        return ""
    text = unicodedata.normalize('NFKD', text).encode('ASCII', 'ignore').decode('utf-8')
    return text.lower().strip()


municipalities = pd.read_csv('data/municipalities.csv') # Equivalent to municipalities table
provinces = pd.read_csv('data/provinces.csv') # Equivalent to provinces table
communities = pd.read_csv('data/communities.csv') # Equivalent to communities table
community_names = communities['name'].apply(normalize_text)

folder_path = "osm_data/"
dir_list = os.listdir(folder_path)
all_boundaries = []
for i, file_name in enumerate(dir_list):
    print(f"Processing ({i+1}/{len(dir_list)}): {file_name}...")

    if file_name.endswith(".osm.pbf") and not file_name.startswith("spain"):
        filename_parts = re.split(r"(\d+)", file_name)
        ccaa_name = filename_parts[0].strip('-')

        match_name, score, match_idx = process.extractOne(
            ccaa_name,
            community_names,
            scorer=fuzz.WRatio
        )
        ccaa_id = communities.iloc[match_idx]['id']
        prov_ids = provinces[provinces['community_id'] == ccaa_id]['id'].to_list()
        mun_ids = municipalities[municipalities['province_id'].isin(prov_ids)]['id'].to_list()

        file_path = os.path.join(folder_path, file_name)
        osm = OSM(file_path)
        boundaries = osm.get_boundaries()

        boundaries = boundaries.dropna(subset=['tags', 'admin_level'])
        boundaries = boundaries[boundaries['osm_type'] == 'relation']
        mask = boundaries.apply(lambda row: keep_row(row, ccaa_id, prov_ids, mun_ids), axis=1)
        boundaries = boundaries[mask]
        boundaries['ccaa_id'] = ccaa_id
        # boundaries = boundaries.drop_duplicates(subset='name')

        if boundaries is not None:
            all_boundaries.append(boundaries)
            
boundaries = pd.concat(all_boundaries, ignore_index=True)

del all_boundaries, osm