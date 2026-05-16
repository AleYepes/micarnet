# INE DATA SOURCES

## GETTING STARTED

All of the following return JSON, lists of objects/dics with "Id" params. "Id" params are always integers, and they seem to be globally unique accross all different endpoints.

### Fetching variables

1. Fetch `https://servicios.ine.es/wstempus/js/ES/VARIABLES` to see a catalog of variables. These are like dimensions instead of metrics.
2. Fetch `https://servicios.ine.es/wstempus/js/ES/VALORES_VARIABLE/{var_id}` to see the values of a given variable

### Fetching data/metrics/tables

1. Fetch `https://servicios.ine.es/wstempus/js/ES/OPERACIONES_DISPONIBLES` to see a catalog of "operations". These are like metric categories
2. Fetch `https://servicios.ine.es/wstempus/js/ES/TABLAS_OPERACION/{op_id}` to see the metrics or tables for a given "operation"
3. Fetch `https://servicios.ine.es/wstempus/jsCache/ES/DATOS_TABLA/{table_id}` to see the content of the metric

### Optional

4. Fetch `https://servicios.ine.es/wstempus/js/ES/GRUPOS_TABLA/{table_id}` to see which group (a proxy for variables) this metric/table is grouped by
5. Fetch `https://servicios.ine.es/wstempus/js/ES/VALORES_GRUPOSTABLA/294/{group_id}` to see the values for the given group/variable. This is equivalent to `https://servicios.ine.es/wstempus/js/ES/VALORES_VARIABLE/{var_id}` although var_id != group_id literally, only semantically.

## Micarnet relevant tables

Add "Id" to URL query for JSON rensponse (list of objects/rows):

> https://servicios.ine.es/wstempus/js/ES/DATOS_TABLA/{"Id"}

## 43: Explotación Estadística del Directorio Central de Empresas

### NUM SCHOOL COMPANIES PER CCAA PER NUM EMPLOYEES:

    {"Id":73020, "Nombre":"Empresas por CCAA, actividad principal (grupos CNAE 2009) y estrato de asalariados.", "Codigo":"NAC-CCAA", "FK_Periodicidad":12, "FK_Publicacion":30, "FK_Periodo_ini":28, "Anyo_Periodo_ini":"2020", "FechaRef_fin":"null", "Ultima_Modificacion":1766397600000},

### NUM SCHOOL OFFICES PER CCAA PER NUM EMPLOYEES:

    {"Id":294, "Nombre":"Locales por CCAA, actividad principal (grupos CNAE 2009) y estrato de asalariados.", "Codigo":"NAC-CCAA", "FK_Periodicidad":12, "FK_Publicacion":30, "FK_Periodo_ini":28, "Anyo_Periodo_ini":"2010", "FechaRef_fin":"null", "Ultima_Modificacion":1765447200000},

### NUM OF ALL COMPANIES PER MUNICIPALITY:

    {"Id":4721, "Nombre":"Empresas por municipio y actividad principal", "Codigo":"NAC-MUN-PROV", "FK_Periodicidad":12, "FK_Publicacion":30, "FK_Periodo_ini":28, "Anyo_Periodo_ini":"2012", "FechaRef_fin":"null", "Ultima_Modificacion":1766397600000},

## 22: Cifras Oficiales de Población de los Municipios Españoles: Revisión del Padrón Municipal

### NUM OF PEOPLE PER MUNICIPALITY:

    All those that contain a province name, ":", and "y sexo". JSON responsese for these start with the provice data, followed by municipalities.

    {"Id":2855, "Nombre":"Albacete: Población por municipios y sexo. ", "Codigo":"PROV-MUN", "FK_Periodicidad":12, "FK_Publicacion":29, "FK_Periodo_ini":28, "Anyo_Periodo_ini":"1996", "FechaRef_fin":"null", "Ultima_Modificacion":1765447200000},

    ...
    

    {"Id":2908, "Nombre":"Ceuta: Población por municipios y sexo. ", "Codigo":"PROV-MUN", "FK_Periodicidad":12, "FK_Publicacion":29, "FK_Periodo_ini":28, "Anyo_Periodo_ini":"1996", "FechaRef_fin":"null", "Ultima_Modificacion":1765447200000},

    {"Id":2909, "Nombre":"Melilla: Población por municipios y sexo. ", "Codigo":"PROV-MUN", "FK_Periodicidad":12, "FK_Publicacion":29, "FK_Periodo_ini":28, "Anyo_Periodo_ini":"1996", "FechaRef_fin":"null", "Ultima_Modificacion":1765447200000}

### NUM OF PEOPLE PER ISLAND (if we choose to use them):

    {"Id":2910, "Nombre":"Población por islas y sexo", "Codigo":"PROV", "FK_Periodicidad":12, "FK_Publicacion":29, "FK_Periodo_ini":28, "Anyo_Periodo_ini":"1996", "FK_Periodo_fin":28, "Anyo_Periodo_fin":"2021", "Ultima_Modificacion":1640253600000},

### NUM OF PEOPLE PER MUN (for all municipalities):

    {"Id":29005, "Nombre":"Cifras oficiales del padrón por municipio", "Codigo":"MUN", "FK_Periodicidad":12, "FK_Publicacion":29, "FK_Periodo_ini":28, "Anyo_Periodo_ini":"1996", "FechaRef_fin":"null", "Ultima_Modificacion":1765447200000},
