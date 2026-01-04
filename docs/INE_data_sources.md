# INE DATA SOURCES

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

    {"Id":2856, "Nombre":"Alicante/Alacant: Población por municipios y sexo. ", "Codigo":"PROV-MUN", "FK_Periodicidad":12, "FK_Publicacion":29, "FK_Periodo_ini":28, "Anyo_Periodo_ini":"1996", "FechaRef_fin":"null", "Ultima_Modificacion":1765447200000},

    {"Id":2857, "Nombre":"Almería: Población por municipios y sexo. ", "Codigo":"PROV-MUN", "FK_Periodicidad":12, "FK_Publicacion":29, "FK_Periodo_ini":28, "Anyo_Periodo_ini":"1996", "FechaRef_fin":"null", "Ultima_Modificacion":1765447200000},

    {"Id":2854, "Nombre":"Araba/Álava: Población por municipios y sexo. ", "Codigo":"PROV-MUN", "FK_Periodicidad":12, "FK_Publicacion":29, "FK_Periodo_ini":28, "Anyo_Periodo_ini":"1996", "FechaRef_fin":"null", "Ultima_Modificacion":1765447200000},

    {"Id":2886, "Nombre":"Asturias: Población por municipios y sexo. ", "Codigo":"PROV-MUN", "FK_Periodicidad":12, "FK_Publicacion":29, "FK_Periodo_ini":28, "Anyo_Periodo_ini":"1996", "FechaRef_fin":"null", "Ultima_Modificacion":1765447200000},

    {"Id":2858, "Nombre":"Ávila: Población por municipios y sexo. ", "Codigo":"PROV-MUN", "FK_Periodicidad":12, "FK_Publicacion":29, "FK_Periodo_ini":28, "Anyo_Periodo_ini":"1996", "FechaRef_fin":"null", "Ultima_Modificacion":1765447200000},

    {"Id":2859, "Nombre":"Badajoz: Población por municipios y sexo. ", "Codigo":"PROV-MUN", "FK_Periodicidad":12, "FK_Publicacion":29, "FK_Periodo_ini":28, "Anyo_Periodo_ini":"1996", "FechaRef_fin":"null", "Ultima_Modificacion":1765447200000},

    {"Id":2860, "Nombre":"Balears, Illes: Población por municipios y sexo. ", "Codigo":"PROV-MUN", "FK_Periodicidad":12, "FK_Publicacion":29, "FK_Periodo_ini":28, "Anyo_Periodo_ini":"1996", "FechaRef_fin":"null", "Ultima_Modificacion":1765447200000},

    {"Id":2861, "Nombre":"Barcelona: Población por municipios y sexo. ", "Codigo":"PROV-MUN", "FK_Periodicidad":12, "FK_Publicacion":29, "FK_Periodo_ini":28, "Anyo_Periodo_ini":"1996", "FechaRef_fin":"null", "Ultima_Modificacion":1765447200000},

    {"Id":2905, "Nombre":"Bizkaia: Población por municipios y sexo. ", "Codigo":"PROV-MUN", "FK_Periodicidad":12, "FK_Publicacion":29, "FK_Periodo_ini":28, "Anyo_Periodo_ini":"1996", "FechaRef_fin":"null", "Ultima_Modificacion":1765447200000},

    {"Id":2862, "Nombre":"Burgos: Población por municipios y sexo. ", "Codigo":"PROV-MUN", "FK_Periodicidad":12, "FK_Publicacion":29, "FK_Periodo_ini":28, "Anyo_Periodo_ini":"1996", "FechaRef_fin":"null", "Ultima_Modificacion":1765447200000},

    {"Id":2863, "Nombre":"Cáceres: Población por municipios y sexo. ", "Codigo":"PROV-MUN", "FK_Periodicidad":12, "FK_Publicacion":29, "FK_Periodo_ini":28, "Anyo_Periodo_ini":"1996", "FechaRef_fin":"null", "Ultima_Modificacion":1765447200000},

    {"Id":2864, "Nombre":"Cádiz: Población por municipios y sexo. ", "Codigo":"PROV-MUN", "FK_Periodicidad":12, "FK_Publicacion":29, "FK_Periodo_ini":28, "Anyo_Periodo_ini":"1996", "FechaRef_fin":"null", "Ultima_Modificacion":1765447200000},

    {"Id":2893, "Nombre":"Cantabria: Población por municipios y sexo. ", "Codigo":"PROV-MUN", "FK_Periodicidad":12, "FK_Publicacion":29, "FK_Periodo_ini":28, "Anyo_Periodo_ini":"1996", "FechaRef_fin":"null", "Ultima_Modificacion":1765447200000},

    {"Id":2865, "Nombre":"Castellón/Castelló: Población por municipios y sexo. ", "Codigo":"PROV-MUN", "FK_Periodicidad":12, "FK_Publicacion":29, "FK_Periodo_ini":28, "Anyo_Periodo_ini":"1996", "FechaRef_fin":"null", "Ultima_Modificacion":1765447200000},

    {"Id":2866, "Nombre":"Ciudad Real: Población por municipios y sexo. ", "Codigo":"PROV-MUN", "FK_Periodicidad":12, "FK_Publicacion":29, "FK_Periodo_ini":28, "Anyo_Periodo_ini":"1996", "FechaRef_fin":"null", "Ultima_Modificacion":1765447200000},

    {"Id":2901, "Nombre":"Córdoba: Población por municipios y sexo. ", "Codigo":"PROV-MUN", "FK_Periodicidad":12, "FK_Publicacion":29, "FK_Periodo_ini":28, "Anyo_Periodo_ini":"1996", "FechaRef_fin":"null", "Ultima_Modificacion":1765447200000},

    {"Id":2868, "Nombre":"Coruña, A: Población por municipios y sexo. ", "Codigo":"PROV-MUN", "FK_Periodicidad":12, "FK_Publicacion":29, "FK_Periodo_ini":28, "Anyo_Periodo_ini":"1996", "FechaRef_fin":"null", "Ultima_Modificacion":1765447200000},

    {"Id":2869, "Nombre":"Cuenca: Población por municipios y sexo. ", "Codigo":"PROV-MUN", "FK_Periodicidad":12, "FK_Publicacion":29, "FK_Periodo_ini":28, "Anyo_Periodo_ini":"1996", "FechaRef_fin":"null", "Ultima_Modificacion":1765447200000},

    {"Id":2873, "Nombre":"Gipuzkoa: Población por municipios y sexo. ", "Codigo":"PROV-MUN", "FK_Periodicidad":12, "FK_Publicacion":29, "FK_Periodo_ini":28, "Anyo_Periodo_ini":"1996", "FechaRef_fin":"null", "Ultima_Modificacion":1765447200000},

    {"Id":2870, "Nombre":"Girona: Población por municipios y sexo. ", "Codigo":"PROV-MUN", "FK_Periodicidad":12, "FK_Publicacion":29, "FK_Periodo_ini":28, "Anyo_Periodo_ini":"1996", "FechaRef_fin":"null", "Ultima_Modificacion":1765447200000},

    {"Id":2871, "Nombre":"Granada: Población por municipios y sexo.", "Codigo":"PROV-MUN", "FK_Periodicidad":12, "FK_Publicacion":29, "FK_Periodo_ini":28, "Anyo_Periodo_ini":"1996", "FechaRef_fin":"null", "Ultima_Modificacion":1765447200000},

    {"Id":2872, "Nombre":"Guadalajara: Población por municipios y sexo. ", "Codigo":"PROV-MUN", "FK_Periodicidad":12, "FK_Publicacion":29, "FK_Periodo_ini":28, "Anyo_Periodo_ini":"1996", "FechaRef_fin":"null", "Ultima_Modificacion":1765447200000},

    {"Id":2874, "Nombre":"Huelva: Población por municipios y sexo. ", "Codigo":"PROV-MUN", "FK_Periodicidad":12, "FK_Publicacion":29, "FK_Periodo_ini":28, "Anyo_Periodo_ini":"1996", "FechaRef_fin":"null", "Ultima_Modificacion":1765447200000},

    {"Id":2875, "Nombre":"Huesca: Población por municipios y sexo. ", "Codigo":"PROV-MUN", "FK_Periodicidad":12, "FK_Publicacion":29, "FK_Periodo_ini":28, "Anyo_Periodo_ini":"1996", "FechaRef_fin":"null", "Ultima_Modificacion":1765447200000},

    {"Id":2876, "Nombre":"Jaén: Población por municipios y sexo. ", "Codigo":"PROV-MUN", "FK_Periodicidad":12, "FK_Publicacion":29, "FK_Periodo_ini":28, "Anyo_Periodo_ini":"1996", "FechaRef_fin":"null", "Ultima_Modificacion":1765447200000},

    {"Id":2877, "Nombre":"León: Población por municipios y sexo. ", "Codigo":"PROV-MUN", "FK_Periodicidad":12, "FK_Publicacion":29, "FK_Periodo_ini":28, "Anyo_Periodo_ini":"1996", "FechaRef_fin":"null", "Ultima_Modificacion":1765447200000},

    {"Id":2878, "Nombre":"Lleida: Población por municipios y sexo. ", "Codigo":"PROV-MUN", "FK_Periodicidad":12, "FK_Publicacion":29, "FK_Periodo_ini":28, "Anyo_Periodo_ini":"1996", "FechaRef_fin":"null", "Ultima_Modificacion":1765447200000},

    {"Id":2880, "Nombre":"Lugo: Población por municipios y sexo. ", "Codigo":"PROV-MUN", "FK_Periodicidad":12, "FK_Publicacion":29, "FK_Periodo_ini":28, "Anyo_Periodo_ini":"1996", "FechaRef_fin":"null", "Ultima_Modificacion":1765447200000},

    {"Id":2881, "Nombre":"Madrid: Población por municipios y sexo. ", "Codigo":"PROV-MUN", "FK_Periodicidad":12, "FK_Publicacion":29, "FK_Periodo_ini":28, "Anyo_Periodo_ini":"1996", "FechaRef_fin":"null", "Ultima_Modificacion":1765447200000},

    {"Id":2882, "Nombre":"Málaga: Población por municipios y sexo. ", "Codigo":"PROV-MUN", "FK_Periodicidad":12, "FK_Publicacion":29, "FK_Periodo_ini":28, "Anyo_Periodo_ini":"1996", "FechaRef_fin":"null", "Ultima_Modificacion":1765447200000},

    {"Id":2883, "Nombre":"Murcia: Población por municipios y sexo. ", "Codigo":"PROV-MUN", "FK_Periodicidad":12, "FK_Publicacion":29, "FK_Periodo_ini":28, "Anyo_Periodo_ini":"1996", "FechaRef_fin":"null", "Ultima_Modificacion":1765447200000},

    {"Id":2884, "Nombre":"Navarra: Población por municipios y sexo. ", "Codigo":"PROV-MUN", "FK_Periodicidad":12, "FK_Publicacion":29, "FK_Periodo_ini":28, "Anyo_Periodo_ini":"1996", "FechaRef_fin":"null", "Ultima_Modificacion":1765447200000},

    {"Id":2885, "Nombre":"Ourense: Población por municipios y sexo. ", "Codigo":"PROV-MUN", "FK_Periodicidad":12, "FK_Publicacion":29, "FK_Periodo_ini":28, "Anyo_Periodo_ini":"1996", "FechaRef_fin":"null", "Ultima_Modificacion":1765447200000},

    {"Id":2888, "Nombre":"Palencia: Población por municipios y sexo. ", "Codigo":"PROV-MUN", "FK_Periodicidad":12, "FK_Publicacion":29, "FK_Periodo_ini":28, "Anyo_Periodo_ini":"1996", "FechaRef_fin":"null", "Ultima_Modificacion":1765447200000},

    {"Id":2889, "Nombre":"Palmas, Las: Población por municipios y sexo. ", "Codigo":"PROV-MUN", "FK_Periodicidad":12, "FK_Publicacion":29, "FK_Periodo_ini":28, "Anyo_Periodo_ini":"1996", "FechaRef_fin":"null", "Ultima_Modificacion":1765447200000},

    {"Id":2890, "Nombre":"Pontevedra: Población por municipios y sexo. ", "Codigo":"PROV-MUN", "FK_Periodicidad":12, "FK_Publicacion":29, "FK_Periodo_ini":28, "Anyo_Periodo_ini":"1996", "FechaRef_fin":"null", "Ultima_Modificacion":1765447200000},

    {"Id":2879, "Nombre":"Rioja, La: Población por municipios y sexo. ", "Codigo":"PROV-MUN", "FK_Periodicidad":12, "FK_Publicacion":29, "FK_Periodo_ini":28, "Anyo_Periodo_ini":"1996", "FechaRef_fin":"null", "Ultima_Modificacion":1765447200000},

    {"Id":2891, "Nombre":"Salamanca: Población por municipios y sexo. ", "Codigo":"PROV-MUN", "FK_Periodicidad":12, "FK_Publicacion":29, "FK_Periodo_ini":28, "Anyo_Periodo_ini":"1996", "FechaRef_fin":"null", "Ultima_Modificacion":1765447200000},

    {"Id":2892, "Nombre":"Santa Cruz de Tenerife: Población por municipios y sexo. ", "Codigo":"PROV-MUN", "FK_Periodicidad":12, "FK_Publicacion":29, "FK_Periodo_ini":28, "Anyo_Periodo_ini":"1996", "FechaRef_fin":"null", "Ultima_Modificacion":1765447200000},

    {"Id":2894, "Nombre":"Segovia: Población por municipios y sexo. ", "Codigo":"PROV-MUN", "FK_Periodicidad":12, "FK_Publicacion":29, "FK_Periodo_ini":28, "Anyo_Periodo_ini":"1996", "FechaRef_fin":"null", "Ultima_Modificacion":1765447200000},

    {"Id":2895, "Nombre":"Sevilla: Población por municipios y sexo. ", "Codigo":"PROV-MUN", "FK_Periodicidad":12, "FK_Publicacion":29, "FK_Periodo_ini":28, "Anyo_Periodo_ini":"1996", "FechaRef_fin":"null", "Ultima_Modificacion":1765447200000},

    {"Id":2896, "Nombre":"Soria: Población por municipios y sexo. ", "Codigo":"PROV-MUN", "FK_Periodicidad":12, "FK_Publicacion":29, "FK_Periodo_ini":28, "Anyo_Periodo_ini":"1996", "FechaRef_fin":"null", "Ultima_Modificacion":1765447200000},

    {"Id":2900, "Nombre":"Tarragona: Población por municipios y sexo. ", "Codigo":"PROV-MUN", "FK_Periodicidad":12, "FK_Publicacion":29, "FK_Periodo_ini":28, "Anyo_Periodo_ini":"1996", "FechaRef_fin":"null", "Ultima_Modificacion":1765447200000},

    {"Id":2899, "Nombre":"Teruel: Población por municipios y sexo. ", "Codigo":"PROV-MUN", "FK_Periodicidad":12, "FK_Publicacion":29, "FK_Periodo_ini":28, "Anyo_Periodo_ini":"1996", "FechaRef_fin":"null", "Ultima_Modificacion":1765447200000},

    {"Id":2902, "Nombre":"Toledo: Población por municipios y sexo. ", "Codigo":"PROV-MUN", "FK_Periodicidad":12, "FK_Publicacion":29, "FK_Periodo_ini":28, "Anyo_Periodo_ini":"1996", "FechaRef_fin":"null", "Ultima_Modificacion":1765447200000},

    {"Id":2903, "Nombre":"Valencia/València: Población por municipios y sexo.", "Codigo":"PROV-MUN", "FK_Periodicidad":12, "FK_Publicacion":29, "FK_Periodo_ini":28, "Anyo_Periodo_ini":"1996", "FechaRef_fin":"null", "Ultima_Modificacion":1765447200000},

    {"Id":2904, "Nombre":"Valladolid: Población por municipios y sexo. ", "Codigo":"PROV-MUN", "FK_Periodicidad":12, "FK_Publicacion":29, "FK_Periodo_ini":28, "Anyo_Periodo_ini":"1996", "FechaRef_fin":"null", "Ultima_Modificacion":1765447200000},

    {"Id":2906, "Nombre":"Zamora: Población por municipios y sexo. ", "Codigo":"PROV-MUN", "FK_Periodicidad":12, "FK_Publicacion":29, "FK_Periodo_ini":28, "Anyo_Periodo_ini":"1996", "FechaRef_fin":"null", "Ultima_Modificacion":1765447200000},

    {"Id":2907, "Nombre":"Zaragoza: Población por municipios y sexo. ", "Codigo":"PROV-MUN", "FK_Periodicidad":12, "FK_Publicacion":29, "FK_Periodo_ini":28, "Anyo_Periodo_ini":"1996", "FechaRef_fin":"null", "Ultima_Modificacion":1765447200000},

    {"Id":2908, "Nombre":"Ceuta: Población por municipios y sexo. ", "Codigo":"PROV-MUN", "FK_Periodicidad":12, "FK_Publicacion":29, "FK_Periodo_ini":28, "Anyo_Periodo_ini":"1996", "FechaRef_fin":"null", "Ultima_Modificacion":1765447200000},

    {"Id":2909, "Nombre":"Melilla: Población por municipios y sexo. ", "Codigo":"PROV-MUN", "FK_Periodicidad":12, "FK_Publicacion":29, "FK_Periodo_ini":28, "Anyo_Periodo_ini":"1996", "FechaRef_fin":"null", "Ultima_Modificacion":1765447200000}

### NUM OF PEOPLE PER ISLAND (if we choose to use them):

    {"Id":2910, "Nombre":"Población por islas y sexo", "Codigo":"PROV", "FK_Periodicidad":12, "FK_Publicacion":29, "FK_Periodo_ini":28, "Anyo_Periodo_ini":"1996", "FK_Periodo_fin":28, "Anyo_Periodo_fin":"2021", "Ultima_Modificacion":1640253600000},

### NUM OF PEOPLE PER MUN (for all municipalities):

    {"Id":29005, "Nombre":"Cifras oficiales del padrón por municipio", "Codigo":"MUN", "FK_Periodicidad":12, "FK_Publicacion":29, "FK_Periodo_ini":28, "Anyo_Periodo_ini":"1996", "FechaRef_fin":"null", "Ultima_Modificacion":1765447200000},
