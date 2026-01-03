import os
import re
import requests
import zipfile
import io
import pandas as pd
from bs4 import BeautifulSoup

def download_and_organize_exams():
    list_url = "https://www.dgt.es/menusecundario/dgt-en-cifras/matraba-listados/conductores-autoescuelas.html"
    output_dir = "data/exams"
    os.makedirs(output_dir, exist_ok=True)
    
    try:
        response = requests.get(list_url, timeout=30)
        response.raise_for_status()
    except requests.RequestException as e:
        print(f"Error fetching page: {e}")
        return

    soup = BeautifulSoup(response.content, 'html.parser')
    zip_links = []
    for a in soup.find_all('a', href=True):
        href = a['href']
        if href.lower().endswith('.zip'):
            full_url = href if href.startswith('http') else f"https://www.dgt.es{href}"
            text = a.get_text(strip=True)
            zip_links.append((full_url, text))

    catalog = []
    for url, link_text in zip_links:
        try:
            r = requests.get(url, stream=True)
            r.raise_for_status()
            
            with zipfile.ZipFile(io.BytesIO(r.content)) as z:
                for file_info in z.infolist():
                    if file_info.filename.lower().endswith('.txt') or file_info.filename.lower().endswith('.csv'):
                        target_filename = file_info.filename
                        target_filename = os.path.basename(target_filename)
                        target_path = os.path.join(output_dir, target_filename)
                        
                        with z.open(file_info) as source, open(target_path, "wb") as target:
                            target.write(source.read())
                        
                        date_match = re.search(r'(\d{8})_(\d{8})', target_filename)
                        year, month = None, None
                        
                        if date_match:
                            start_date = date_match.group(1) # YYYYMMDD
                            year = start_date[:4]
                            month = start_date[4:6]
                        else:
                            url_parts = url.split('/')
                            for part in reversed(url_parts):
                                if part.isdigit() and len(part) == 4 and part.startswith('20'):
                                    year = part
                                    break
                            if year:
                                try:
                                    idx = url_parts.index(year)
                                    if idx + 1 < len(url_parts) and url_parts[idx+1].isdigit():
                                        month = url_parts[idx+1].zfill(2)
                                except ValueError:
                                    pass

                        file_size = os.path.getsize(target_path)
                        catalog.append({
                            "year": year,
                            "month": month,
                            "filename": target_filename,
                            "filepath": target_path,
                            "filesize_bytes": file_size,
                            "source_zip_url": url
                        })

        except Exception as e:
            print(f"   Error processing {url}: {e}")

    # Save catalog
    df_catalog = pd.DataFrame(catalog)
    if not df_catalog.empty:
        df_catalog.sort_values(by=['year', 'month'], inplace=True, na_position='first')
        catalog_path = "data/exams_catalog.csv"
        df_catalog.to_csv(catalog_path, index=False)

if __name__ == "__main__":
    download_and_organize_exams()