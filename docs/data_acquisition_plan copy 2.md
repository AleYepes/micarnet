# Data Acquisition & Management Plan

## Objective

To build the most comprehensive, accurate, and useful dataset of Spanish driving schools (autoescuelas) by synthesizing official government records with geospatial data and third-party enrichment.

## 1. Architecture: Set up a "Worker" App

Prepare `apps/worker` to handle data ingestion, cleaning, and synchronization.
    - Ensures strict separation of concerns, so heavy scraping dependencies (Playwright, cheerio, etc.) don't pollute the `apps/web` bundle.
    - `apps/worker`: The executable Node.js application to collect data (DGT, INE, Google).
    - `packages/db`: Shared Drizzle schema and client used by -both- `web` and `worker`.

## 2. The Foundation: Location Data

DGT data contains corrupt or inconsistent location data, so we need varying sources to clean and validate the DGT data.

### Location Source A: INE API VARIABLES

ALL DONE

### Location Source B: NIE TABLE_DATA

#### 43: Explotación Estadística del Directorio Central de Empresas

DONE

#### 22: Cifras Oficiales de Población de los Municipios Españoles: Revisión del Padrón Municipal

DONE


https://servicios.ine.es/wstempus/js/ES/OPERACIONES_DISPONIBLES
#### 353: Atlas de distribución de renta de los hogares

https://servicios.ine.es/wstempus/js/ES/TABLAS_OPERACION/353

##### gini index

https://servicios.ine.es/wstempus/jsCache/ES/DATOS_TABLA/53688?nult=2
,{"Id":53688, "Nombre":"Índice de Gini y Distribución de la renta P80/P20", "Codigo":"NAC-CCAA-PROV", "FK_Periodicidad":12, "FK_Publicacion":507, "FK_Periodo_ini":28, "Anyo_Periodo_ini":"2015", "FechaRef_fin":"null", "Ultima_Modificacion":1761037200000}

All those with name "Índice de Gini y Distribución de la renta" in `https://servicios.ine.es/wstempus/js/ES/TABLAS_OPERACION/353`

##### income distribution quantiles (discrete)

,{"Id":53694, "Nombre":"Porcentaje de población con ingresos por unidad de consumo por debajo/encima de determinados umbrales relativos por sexo", "Codigo":"NAC-CCAA-PROV", "FK_Periodicidad":12, "FK_Publicacion":507, "FK_Periodo_ini":28, "Anyo_Periodo_ini":"2015", "FechaRef_fin":"null", "Ultima_Modificacion":1761037200000}

All those with name "Porcentaje de población con ingresos por unidad de consumo por debajo/encima de determinados umbrales relativos por sexo" in `https://servicios.ine.es/wstempus/js/ES/TABLAS_OPERACION/353`


##### income means before and after taxes per district

{"Id":30656, "Nombre":"Indicadores de renta media y mediana", "Codigo":"DIST-SECC-MUN", "FK_Periodicidad":12, "FK_Publicacion":507, "FK_Periodo_ini":28, "Anyo_Periodo_ini":"2015", "FechaRef_fin":"null", "Ultima_Modificacion":1761037200000}


All those with name "Indicadores de renta media y mediana" but w/o " y " in `https://servicios.ine.es/wstempus/js/ES/TABLAS_OPERACION/353`



#### 314: Encuesta de Presupuestos Familiares (EPF)



#### 450: Estadística Continua de Población



### Location Source C: CNIG (Boundaries)

Import GeoJSON/Shapefiles into a PostGIS-enabled database (or store as simplified GeoJSON blobs if PostGIS is overkill).

## 3. The Core: Autoescuela Registry (DGT)

A. Implement the reference python scripts in the root (`dgt_scraper.py` and `exam_scraper.py`) within `apps/worker` using TypeScript. Make sure they adhere with the schemas defined by the NIE and CNIG data.
B. Normalization:
    - Scraper fetches a school
    - Worker attempts to match school data against `municipalities` table (e.g., "Alcalá de Henares").
    - If match found: Link via Foreign Key.
    - If no match: Flag for review.

## 4. The Polish: Enrichment (Places API)

Once DGT school data is validated, the `apps/worker` can queries Google Places API for metadata (images, reviews) and elaborate the school data.
    - Consider creating new tables for large files with foreign keys to `schools`.