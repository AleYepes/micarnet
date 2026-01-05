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

Begin fleshing out the logic in `apps/worker` and `packages/db` to call the official INE JSON API, and to populate `communities`, `provinces`, and `municipalities` tables.

#### 70: Communities

`https://servicios.ine.es/wstempus/js/ES/VALORES_VARIABLE/70` queries the INE API for a list of communities.

The INE responds with a JSON object titled 70:
```
[{"Id":16473, "FK_Variable":70, "Nombre":"Total Nacional", "Codigo":"00"}
,{"Id":8997, "FK_Variable":70, "Nombre":"Andalucía", "Codigo":"01", "FK_JerarquiaPadres":[16473,274511,274508]}
,{"Id":8998, "FK_Variable":70, "Nombre":"Aragón", "Codigo":"02", "FK_JerarquiaPadres":[16473,274511,274508]}
,{"Id":8999, "FK_Variable":70, "Nombre":"Asturias, Principado de", "Codigo":"03", "FK_JerarquiaPadres":[16473,274511,274508]}
,{"Id":9000, "FK_Variable":70, "Nombre":"Balears, Illes", "Codigo":"04", "FK_JerarquiaPadres":[16473,274511,274508]}
,{"Id":9001, "FK_Variable":70, "Nombre":"Canarias", "Codigo":"05", "FK_JerarquiaPadres":[16473,274511,274508]}
,{"Id":9002, "FK_Variable":70, "Nombre":"Cantabria", "Codigo":"06", "FK_JerarquiaPadres":[16473,274511,274508]}
,{"Id":9003, "FK_Variable":70, "Nombre":"Castilla y León", "Codigo":"07", "FK_JerarquiaPadres":[16473,274511,274508]}
,{"Id":9004, "FK_Variable":70, "Nombre":"Castilla - La Mancha", "Codigo":"08", "FK_JerarquiaPadres":[16473,274511,274508]}
,{"Id":9005, "FK_Variable":70, "Nombre":"Cataluña", "Codigo":"09", "FK_JerarquiaPadres":[16473,274511,274508]}
,{"Id":9006, "FK_Variable":70, "Nombre":"Comunitat Valenciana", "Codigo":"10", "FK_JerarquiaPadres":[16473,274511,274508]}
,{"Id":9007, "FK_Variable":70, "Nombre":"Extremadura", "Codigo":"11", "FK_JerarquiaPadres":[16473,274511,274508]}
,{"Id":9008, "FK_Variable":70, "Nombre":"Galicia", "Codigo":"12", "FK_JerarquiaPadres":[16473,274511,274508]}
,{"Id":9009, "FK_Variable":70, "Nombre":"Madrid, Comunidad de", "Codigo":"13", "FK_JerarquiaPadres":[16473,274511,274508]}
,{"Id":9010, "FK_Variable":70, "Nombre":"Murcia, Región de", "Codigo":"14", "FK_JerarquiaPadres":[16473,274511,274508]}
,{"Id":9011, "FK_Variable":70, "Nombre":"Navarra, Comunidad Foral de", "Codigo":"15", "FK_JerarquiaPadres":[16473,274511,274508]}
,{"Id":9012, "FK_Variable":70, "Nombre":"País Vasco", "Codigo":"16", "FK_JerarquiaPadres":[16473,274511,274508]}
,{"Id":9013, "FK_Variable":70, "Nombre":"Rioja, La", "Codigo":"17", "FK_JerarquiaPadres":[16473,274511,274508]}
,{"Id":9015, "FK_Variable":70, "Nombre":"Ceuta", "Codigo":"18", "FK_JerarquiaPadres":[16473,274511,274508]}
,{"Id":8995, "FK_Variable":70, "Nombre":"Melilla", "Codigo":"19", "FK_JerarquiaPadres":[16473,274511,274508]}
,{"Id":68, "FK_Variable":70, "Nombre":"Extranjero", "Codigo":""}
,{"Id":9014, "FK_Variable":70, "Nombre":"Ceuta y Melilla", "Codigo":"", "FK_JerarquiaPadres":[16473,274508]}
,{"Id":15299, "FK_Variable":70, "Nombre":"Total Ciudades con Metro", "Codigo":""}
,{"Id":274508, "FK_Variable":70, "Nombre":"Total capitales de provincia", "Codigo":"00000"}
,{"Id":285494, "FK_Variable":70, "Nombre":"Otras Comunidades Autónomas", "Codigo":""}
,{"Id":291907, "FK_Variable":70, "Nombre":"Peninsula y Baleares", "Codigo":""}
,{"Id":416366, "FK_Variable":70, "Nombre":"No residente", "Codigo":""}
,{"Id":416510, "FK_Variable":70, "Nombre":"Total Islas", "Codigo":""}
]
```

Id represents INE's internal index system. It's not exclusive to communities
Nombre stores the official name
Codigo stores the official code exclusive to communities
FK_JerarquiaPadres stores the entry's parent Ids. In this case, since CCAAs are the highest tier regions, the parents are metrics like "Total Nacional"

We may want to extract all entries where Codigo is notna, and where FK_JerarquiaPadres is also notna. Not sure what to do with the remaining entries.

#### 20: Provinces (technically islands, but 20 also includes municipalities, so 2 for 1)

`https://servicios.ine.es/wstempus/js/ES/VALORES_VARIABLE/20` queries the INE API for a list of communities.

The INE responds with a JSON object titled 20:
```
[{"Id":3, "FK_Variable":20, "Nombre":"Albacete", "Codigo":"02", "FK_JerarquiaPadres":[9004]}
,{"Id":4, "FK_Variable":20, "Nombre":"Alicante/Alacant", "Codigo":"03", "FK_JerarquiaPadres":[9006]}
,{"Id":5, "FK_Variable":20, "Nombre":"Almería", "Codigo":"04", "FK_JerarquiaPadres":[8997]}
,{"Id":2, "FK_Variable":20, "Nombre":"Araba/Álava", "Codigo":"01", "FK_JerarquiaPadres":[9012]}
,{"Id":33, "FK_Variable":20, "Nombre":"Asturias", "Codigo":"33", "FK_JerarquiaPadres":[8999]}
,{"Id":6, "FK_Variable":20, "Nombre":"Ávila", "Codigo":"05", "FK_JerarquiaPadres":[9003]}
,{"Id":7, "FK_Variable":20, "Nombre":"Badajoz", "Codigo":"06", "FK_JerarquiaPadres":[9007]}
...
,{"Id":49, "FK_Variable":20, "Nombre":"Zamora", "Codigo":"49", "FK_JerarquiaPadres":[9003]}
,{"Id":50, "FK_Variable":20, "Nombre":"Zaragoza", "Codigo":"50", "FK_JerarquiaPadres":[8998]}
,{"Id":51, "FK_Variable":20, "Nombre":"Ceuta", "Codigo":"51", "FK_JerarquiaPadres":[9015]}
,{"Id":52, "FK_Variable":20, "Nombre":"Melilla", "Codigo":"52", "FK_JerarquiaPadres":[8995]}
,{"Id":8609, "FK_Variable":20, "Nombre":"Formentera", "Codigo":"07071", "FK_JerarquiaPadres":[8]}
,{"Id":8610, "FK_Variable":20, "Nombre":"Ibiza", "Codigo":"07072", "FK_JerarquiaPadres":[8]}
,{"Id":8611, "FK_Variable":20, "Nombre":"Mallorca", "Codigo":"07073", "FK_JerarquiaPadres":[8]}
,{"Id":8612, "FK_Variable":20, "Nombre":"Menorca", "Codigo":"07074", "FK_JerarquiaPadres":[8]}
,{"Id":8613, "FK_Variable":20, "Nombre":"Fuerteventura", "Codigo":"35351", "FK_JerarquiaPadres":[35]}
,{"Id":8614, "FK_Variable":20, "Nombre":"Gran Canaria", "Codigo":"35352", "FK_JerarquiaPadres":[35]}
,{"Id":8615, "FK_Variable":20, "Nombre":"Lanzarote", "Codigo":"35353", "FK_JerarquiaPadres":[35]}
,{"Id":8616, "FK_Variable":20, "Nombre":"Gomera, La", "Codigo":"38381", "FK_JerarquiaPadres":[38]}
,{"Id":8617, "FK_Variable":20, "Nombre":"Hierro, El", "Codigo":"38382", "FK_JerarquiaPadres":[38]}
,{"Id":8618, "FK_Variable":20, "Nombre":"Palma, La", "Codigo":"38383", "FK_JerarquiaPadres":[38]}
,{"Id":8619, "FK_Variable":20, "Nombre":"Tenerife", "Codigo":"38384", "FK_JerarquiaPadres":[38]}
,{"Id":397705, "FK_Variable":20, "Nombre":"Ibiza y Formentera", "Codigo":"", "FK_JerarquiaPadres":[8]}
]
```

This has a similar format as the communities JSON, and you can see that the provinces' parent Ids correspond to the community Ids (internal Id, not codes).
The DGT site uses the Codigo ids, instead of the internal INE ids, so we'll want to store both in our db to join the two tables.

Again, I'm not sure what to do about the bottom entries. In this case, they're islands, hense the longer Codigo value. These are technically not municipalities, but aren't provinces either. We can save these in an island table or just ignore them.

#### 19: Municipalities

`https://servicios.ine.es/wstempus/js/ES/VALORES_VARIABLE/19` queries the INE API for a list of municipalities.

As you'd suspect, the INE responds with a JSON object titled 19. This one is rather large and it takes the servers a while to respond:
```
[{"Id":456, "FK_Variable":19, "Nombre":"Orbaizeta", "Codigo":"31195", "FK_JerarquiaPadres":[32,392378]}
,{"Id":457, "FK_Variable":19, "Nombre":"Orbara", "Codigo":"31196", "FK_JerarquiaPadres":[32,392378]}
,{"Id":458, "FK_Variable":19, "Nombre":"Orísoain", "Codigo":"31197", "FK_JerarquiaPadres":[32,392381]}
,{"Id":459, "FK_Variable":19, "Nombre":"Oronz/Orontze", "Codigo":"31198", "FK_JerarquiaPadres":[32,392378]}
,{"Id":460, "FK_Variable":19, "Nombre":"Oroz-Betelu/Orotz-Betelu", "Codigo":"31199", "FK_JerarquiaPadres":[32,392378]}
,{"Id":461, "FK_Variable":19, "Nombre":"Oteiza", "Codigo":"31200", "FK_JerarquiaPadres":[32,392377]}
,{"Id":462, "FK_Variable":19, "Nombre":"Cendea de Olza/Oltza Zendea", "Codigo":"31193", "FK_JerarquiaPadres":[32,392380]}
...
,{"Id":17226, "FK_Variable":19, "Nombre":"Población en municipios desaparecidos de Valencia/València", "Codigo":"46999", "FK_JerarquiaPadres":[46]}
,{"Id":17227, "FK_Variable":19, "Nombre":"Población en municipios desaparecidos de Valladolid", "Codigo":"47999", "FK_JerarquiaPadres":[47]}
,{"Id":17228, "FK_Variable":19, "Nombre":"Población en municipios desaparecidos de Vizcaya", "Codigo":"48999", "FK_JerarquiaPadres":[48]}
,{"Id":17229, "FK_Variable":19, "Nombre":"Población en municipios desaparecidos de Zamora", "Codigo":"49999", "FK_JerarquiaPadres":[49]}
,{"Id":17230, "FK_Variable":19, "Nombre":"Población en municipios desaparecidos de Zaragoza", "Codigo":"50999", "FK_JerarquiaPadres":[50]}
,{"Id":22322, "FK_Variable":19, "Nombre":"Alagón del Río", "Codigo":"10903", "FK_JerarquiaPadres":[11,392344]}
,{"Id":22323, "FK_Variable":19, "Nombre":"Vegaviana", "Codigo":"10902", "FK_JerarquiaPadres":[11,392342]}
,{"Id":23102, "FK_Variable":19, "Nombre":"Fresnedo", "Codigo":"24072", "FK_JerarquiaPadres":[25]}
,{"Id":23218, "FK_Variable":19, "Nombre":"Villanueva de la Concepción", "Codigo":"29902", "FK_JerarquiaPadres":[30,392118]}
,{"Id":23219, "FK_Variable":19, "Nombre":"Canonja, La", "Codigo":"43907", "FK_JerarquiaPadres":[43,392296]}
,{"Id":274523, "FK_Variable":19, "Nombre":"Guadiana", "Codigo":"06903", "FK_JerarquiaPadres":[7,392332]}
,{"Id":292659, "FK_Variable":19, "Nombre":"Valderrubio", "Codigo":"18914", "FK_JerarquiaPadres":[19,392095]}
,{"Id":292660, "FK_Variable":19, "Nombre":"Tiétar", "Codigo":"10904", "FK_JerarquiaPadres":[11,392348]}
,{"Id":292661, "FK_Variable":19, "Nombre":"Oza-Cesuras", "Codigo":"15902", "FK_JerarquiaPadres":[16,392350]}
,{"Id":298952, "FK_Variable":19, "Nombre":"Játar", "Codigo":"18106", "FK_JerarquiaPadres":[19,392093]}
,{"Id":298953, "FK_Variable":19, "Nombre":"Balanegra", "Codigo":"04904", "FK_JerarquiaPadres":[5,392075]}
,{"Id":298954, "FK_Variable":19, "Nombre":"Pueblonuevo de Miramontes", "Codigo":"10905", "FK_JerarquiaPadres":[11,392348]}
,{"Id":298955, "FK_Variable":19, "Nombre":"Montecorto", "Codigo":"29903", "FK_JerarquiaPadres":[30,392120]}
,{"Id":298956, "FK_Variable":19, "Nombre":"Serrato", "Codigo":"29904", "FK_JerarquiaPadres":[30,392120]}
,{"Id":298957, "FK_Variable":19, "Nombre":"Dehesas Viejas", "Codigo":"18065", "FK_JerarquiaPadres":[19,392094]}
,{"Id":304573, "FK_Variable":19, "Nombre":"Domingo Pérez de Granada", "Codigo":"18915", "FK_JerarquiaPadres":[19,392094]}
,{"Id":311422, "FK_Variable":19, "Nombre":"Cerdedo-Cotobade", "Codigo":"36902", "FK_JerarquiaPadres":[36,392364]}
,{"Id":321952, "FK_Variable":19, "Nombre":"San Martín del Tesorillo", "Codigo":"11903", "FK_JerarquiaPadres":[12,392085]}
,{"Id":321953, "FK_Variable":19, "Nombre":"Fuente Carreteros", "Codigo":"14901", "FK_JerarquiaPadres":[15,392092]}
,{"Id":321954, "FK_Variable":19, "Nombre":"Guijarrosa, La", "Codigo":"14902", "FK_JerarquiaPadres":[15,392091]}
,{"Id":321955, "FK_Variable":19, "Nombre":"Fornes", "Codigo":"18077", "FK_JerarquiaPadres":[19,392093]}
,{"Id":321956, "FK_Variable":19, "Nombre":"Torrenueva Costa", "Codigo":"18916", "FK_JerarquiaPadres":[19,392096]}
,{"Id":321957, "FK_Variable":19, "Nombre":"Zarza-Perrunal, La\t", "Codigo":"21902", "FK_JerarquiaPadres":[22,392108]}
,{"Id":321958, "FK_Variable":19, "Nombre":"Palmar de Troya, El", "Codigo":"41904", "FK_JerarquiaPadres":[41,392125]}
,{"Id":416493, "FK_Variable":19, "Nombre":"Usansolo", "Codigo":"48916", "FK_JerarquiaPadres":[48]}
]
```

This time the parent Ids seem to reference the 2-digit Cogido values for provinces, and the first 2 digits of the municipalities' 5-digit Codigo values correspond with its province's 2-digit Cogido value. This table also has some odd entries whose name start with "Población en municipios desaparecidos". We want to ignore these.

I also just noticed some names are oddly formatted, for example, "Zarza-Perrunal, La\t" Does this mean that it could be named "La Zarza-Perrunal" or "t Zarza-Perrunal"? "Oronz/Orontze" the forward slash seem to mean "or", so "Oronz" or "Orontze", but the use in "La/t" confuses me.

In any case, we need to set up the worker app to fetch these 3 official sources and to parse and push their contents into the postgresdb via Drizzle. We don't want to add unnecessary data that bloats the db, so I'm thinking about dropping the FK_Variable features from the primary tables. We create a metatable to store the data relevant to queries, like the respective FK_Variable, URL that fetched the JSON, the last time it was scraped, and so on. Something like that. We want to keep the primary data tables lean and ready for production, using foreign keys between them to map the relationships between CCAAs, provinces, and municipalities.

### Location Source B: NIE TABLE_DATA

The CNAE also has non-variable data we can use.
To query this data, we need to use a slightly different format from the variable queries. We need use the DATOS_TABLA endpoint and a compatible "Id". This returns a JSON object with list of objects/rows like those above:

`https://servicios.ine.es/wstempus/js/ES/DATOS_TABLA/{"Id"}`


#### 43: Explotación Estadística del Directorio Central de Empresas

##### Number of other educational schools (CNAE 855) companies per ccaa per num employees:

{"Id":73020, "Nombre":"Empresas por CCAA, actividad principal (grupos CNAE 2009) y estrato de asalariados.", "Codigo":"NAC-CCAA", "FK_Periodicidad":12, "FK_Publicacion":30, "FK_Periodo_ini":28, "Anyo_Periodo_ini":"2020", "FechaRef_fin":"null", "Ultima_Modificacion":1766397600000}

For this one we add a filter to only call CNAE 855 data:
`https://servicios.ine.es/wstempus/js/ES/DATOS_TABLA/73020?tv=338:18326`

The response for this looks like:
```
[{"COD":"DIR188514", "Nombre":"Nacional. Total. Total. 855 Otra educación.", "FK_Unidad":97, "FK_Escala":1, "Data":[{"Fecha":1735686000000, "FK_TipoDato":1, "FK_Periodo":28, "Anyo":2025, "Valor":91715.0, "Secreto":false}
,{"Fecha":1704063600000, "FK_TipoDato":1, "FK_Periodo":28, "Anyo":2024, "Valor":87602.0, "Secreto":false}
,{"Fecha":1672527600000, "FK_TipoDato":1, "FK_Periodo":28, "Anyo":2023, "Valor":84368.0, "Secreto":false}
,{"Fecha":1640991600000, "FK_TipoDato":1, "FK_Periodo":28, "Anyo":2022, "Valor":87631.0, "Secreto":false}
,{"Fecha":1609455600000, "FK_TipoDato":1, "FK_Periodo":28, "Anyo":2021, "Valor":83133.0, "Secreto":false}
,{"Fecha":1577833200000, "FK_TipoDato":1, "FK_Periodo":28, "Anyo":2020, "Valor":84594.0, "Secreto":false}
]
}
,{"COD":"DIR188515", "Nombre":"Nacional. Sin asalariados. Total. 855 Otra educación.", "FK_Unidad":97, "FK_Escala":1, "Data":[{"Fecha":1735686000000, "FK_TipoDato":1, "FK_Periodo":28, "Anyo":2025, "Valor":60201.0, "Secreto":false}
,{"Fecha":1704063600000, "FK_TipoDato":1, "FK_Periodo":28, "Anyo":2024, "Valor":55937.0, "Secreto":false}
,{"Fecha":1672527600000, "FK_TipoDato":1, "FK_Periodo":28, "Anyo":2023, "Valor":54441.0, "Secreto":false}
,{"Fecha":1640991600000, "FK_TipoDato":1, "FK_Periodo":28, "Anyo":2022, "Valor":58505.0, "Secreto":false}
,{"Fecha":1609455600000, "FK_TipoDato":1, "FK_Periodo":28, "Anyo":2021, "Valor":54721.0, "Secreto":false}
,{"Fecha":1577833200000, "FK_TipoDato":1, "FK_Periodo":28, "Anyo":2020, "Valor":56255.0, "Secreto":false}
]
}
,{"COD":"DIR188516", "Nombre":"Nacional. De 1 a 2 asalariados. Total. 855 Otra educación.", "FK_Unidad":97, "FK_Escala":1, "Data":[{"Fecha":1735686000000, "FK_TipoDato":1, "FK_Periodo":28, "Anyo":2025, "Valor":17297.0, "Secreto":false}
,{"Fecha":1704063600000, "FK_TipoDato":1, "FK_Periodo":28, "Anyo":2024, "Valor":17690.0, "Secreto":false}
,{"Fecha":1672527600000, "FK_TipoDato":1, "FK_Periodo":28, "Anyo":2023, "Valor":16428.0, "Secreto":false}
,{"Fecha":1640991600000, "FK_TipoDato":1, "FK_Periodo":28, "Anyo":2022, "Valor":16049.0, "Secreto":false}
,{"Fecha":1609455600000, "FK_TipoDato":1, "FK_Periodo":28, "Anyo":2021, "Valor":16135.0, "Secreto":false}
,{"Fecha":1577833200000, "FK_TipoDato":1, "FK_Periodo":28, "Anyo":2020, "Valor":15335.0, "Secreto":false}
]
}
...
,{"COD":"DIR822510", "Nombre":"Melilla. De 250 a 999. Total de empresas. Otra educación. Empresas. ", "FK_Unidad":97, "FK_Escala":1, "Data":[{"Fecha":1735686000000, "FK_TipoDato":1, "FK_Periodo":28, "Anyo":2025, "Valor":0.0, "Secreto":false}
,{"Fecha":1704063600000, "FK_TipoDato":1, "FK_Periodo":28, "Anyo":2024, "Valor":0.0, "Secreto":false}
,{"Fecha":1672527600000, "FK_TipoDato":1, "FK_Periodo":28, "Anyo":2023, "Valor":0.0, "Secreto":false}
,{"Fecha":1640991600000, "FK_TipoDato":1, "FK_Periodo":28, "Anyo":2022, "Valor":0.0, "Secreto":false}
,{"Fecha":1609455600000, "FK_TipoDato":1, "FK_Periodo":28, "Anyo":2021, "Valor":0.0, "Secreto":false}
,{"Fecha":1577833200000, "FK_TipoDato":1, "FK_Periodo":28, "Anyo":2020, "Valor":0.0, "Secreto":false}
]
}
,{"COD":"DIR480756", "Nombre":"Melilla, Ciudad Autónoma de, De 1000 a 4999 asalariados, Total de empresas, Otra educación, Empresas", "FK_Unidad":97, "FK_Escala":1, "Data":[{"Fecha":1735686000000, "FK_TipoDato":1, "FK_Periodo":28, "Anyo":2025, "Valor":0.0, "Secreto":false}
,{"Fecha":1704063600000, "FK_TipoDato":1, "FK_Periodo":28, "Anyo":2024, "Valor":0.0, "Secreto":false}
,{"Fecha":1672527600000, "FK_TipoDato":1, "FK_Periodo":28, "Anyo":2023, "Valor":0.0, "Secreto":false}
,{"Fecha":1640991600000, "FK_TipoDato":1, "FK_Periodo":28, "Anyo":2022, "Valor":0.0, "Secreto":false}
,{"Fecha":1609455600000, "FK_TipoDato":1, "FK_Periodo":28, "Anyo":2021, "Valor":0.0, "Secreto":false}
,{"Fecha":1577833200000, "FK_TipoDato":1, "FK_Periodo":28, "Anyo":2020, "Valor":0.0, "Secreto":false}
]
}
,{"COD":"DIR480422", "Nombre":"Melilla, Ciudad Autónoma de, De 5000 o más asalariados, Total de empresas, Otra educación, Empresas", "FK_Unidad":97, "FK_Escala":1, "Data":[{"Fecha":1735686000000, "FK_TipoDato":1, "FK_Periodo":28, "Anyo":2025, "Valor":0.0, "Secreto":false}
,{"Fecha":1704063600000, "FK_TipoDato":1, "FK_Periodo":28, "Anyo":2024, "Valor":0.0, "Secreto":false}
,{"Fecha":1672527600000, "FK_TipoDato":1, "FK_Periodo":28, "Anyo":2023, "Valor":0.0, "Secreto":false}
,{"Fecha":1640991600000, "FK_TipoDato":1, "FK_Periodo":28, "Anyo":2022, "Valor":0.0, "Secreto":false}
,{"Fecha":1609455600000, "FK_TipoDato":1, "FK_Periodo":28, "Anyo":2021, "Valor":0.0, "Secreto":false}
,{"Fecha":1577833200000, "FK_TipoDato":1, "FK_Periodo":28, "Anyo":2020, "Valor":0.0, "Secreto":false}
]
}
]
```

##### Number of other educational schools (CNAE 855) locales per ccaa per num employees:

{"Id":294, "Nombre":"Locales por CCAA, actividad principal (grupos CNAE 2009) y estrato de asalariados.", "Codigo":"NAC-CCAA", "FK_Periodicidad":12, "FK_Publicacion":30, "FK_Periodo_ini":28, "Anyo_Periodo_ini":"2010", "FechaRef_fin":"null", "Ultima_Modificacion":1765447200000},

For this one we also add a filter for CNAE 855:
`https://servicios.ine.es/wstempus/js/ES/DATOS_TABLA/294?tv=338:18326`

The response looks like:
```
[{"COD":"DIR308292", "Nombre":"Nacional. Total. 855 Otra educación.", "FK_Unidad":128, "FK_Escala":1, "Data":[{"Fecha":1735686000000, "FK_TipoDato":1, "FK_Periodo":28, "Anyo":2025, "Valor":103149.0, "Secreto":false}
,{"Fecha":1704063600000, "FK_TipoDato":1, "FK_Periodo":28, "Anyo":2024, "Valor":98564.0, "Secreto":false}
,{"Fecha":1672527600000, "FK_TipoDato":1, "FK_Periodo":28, "Anyo":2023, "Valor":95223.0, "Secreto":false}
,{"Fecha":1640991600000, "FK_TipoDato":1, "FK_Periodo":28, "Anyo":2022, "Valor":98245.0, "Secreto":false}
,{"Fecha":1609455600000, "FK_TipoDato":1, "FK_Periodo":28, "Anyo":2021, "Valor":93396.0, "Secreto":false}
,{"Fecha":1577833200000, "FK_TipoDato":1, "FK_Periodo":28, "Anyo":2020, "Valor":94825.0, "Secreto":false}
,{"Fecha":1546297200000, "FK_TipoDato":1, "FK_Periodo":28, "Anyo":2019, "Valor":88073.0, "Secreto":false}
,{"Fecha":1514761200000, "FK_TipoDato":1, "FK_Periodo":28, "Anyo":2018, "Valor":87822.0, "Secreto":false}
,{"Fecha":1483225200000, "FK_TipoDato":1, "FK_Periodo":28, "Anyo":2017, "Valor":84389.0, "Secreto":false}
,{"Fecha":1451602800000, "FK_TipoDato":1, "FK_Periodo":28, "Anyo":2016, "Valor":80065.0, "Secreto":false}
,{"Fecha":1420066800000, "FK_TipoDato":1, "FK_Periodo":28, "Anyo":2015, "Valor":74658.0, "Secreto":false}
,{"Fecha":1388530800000, "FK_TipoDato":1, "FK_Periodo":28, "Anyo":2014, "Valor":67638.0, "Secreto":false}
,{"Fecha":1356994800000, "FK_TipoDato":1, "FK_Periodo":28, "Anyo":2013, "Valor":62212.0, "Secreto":false}
,{"Fecha":1325372400000, "FK_TipoDato":1, "FK_Periodo":28, "Anyo":2012, "Valor":61996.0, "Secreto":false}
,{"Fecha":1293836400000, "FK_TipoDato":1, "FK_Periodo":28, "Anyo":2011, "Valor":58743.0, "Secreto":false}
,{"Fecha":1262300400000, "FK_TipoDato":1, "FK_Periodo":28, "Anyo":2010, "Valor":57380.0, "Secreto":false}
]
}
,{"COD":"DIR308293", "Nombre":"Nacional. Sin asalariados. 855 Otra educación.", "FK_Unidad":128, "FK_Escala":1, "Data":[{"Fecha":1735686000000, "FK_TipoDato":1, "FK_Periodo":28, "Anyo":2025, "Valor":68210.0, "Secreto":false}
,{"Fecha":1704063600000, "FK_TipoDato":1, "FK_Periodo":28, "Anyo":2024, "Valor":63628.0, "Secreto":false}
,{"Fecha":1672527600000, "FK_TipoDato":1, "FK_Periodo":28, "Anyo":2023, "Valor":62168.0, "Secreto":false}
,{"Fecha":1640991600000, "FK_TipoDato":1, "FK_Periodo":28, "Anyo":2022, "Valor":66054.0, "Secreto":false}
,{"Fecha":1609455600000, "FK_TipoDato":1, "FK_Periodo":28, "Anyo":2021, "Valor":62104.0, "Secreto":false}
,{"Fecha":1577833200000, "FK_TipoDato":1, "FK_Periodo":28, "Anyo":2020, "Valor":63657.0, "Secreto":false}
,{"Fecha":1546297200000, "FK_TipoDato":1, "FK_Periodo":28, "Anyo":2019, "Valor":58871.0, "Secreto":false}
,{"Fecha":1514761200000, "FK_TipoDato":1, "FK_Periodo":28, "Anyo":2018, "Valor":56393.0, "Secreto":false}
,{"Fecha":1483225200000, "FK_TipoDato":1, "FK_Periodo":28, "Anyo":2017, "Valor":53433.0, "Secreto":false}
,{"Fecha":1451602800000, "FK_TipoDato":1, "FK_Periodo":28, "Anyo":2016, "Valor":49286.0, "Secreto":false}
,{"Fecha":1420066800000, "FK_TipoDato":1, "FK_Periodo":28, "Anyo":2015, "Valor":45170.0, "Secreto":false}
,{"Fecha":1388530800000, "FK_TipoDato":1, "FK_Periodo":28, "Anyo":2014, "Valor":39178.0, "Secreto":false}
,{"Fecha":1356994800000, "FK_TipoDato":1, "FK_Periodo":28, "Anyo":2013, "Valor":35474.0, "Secreto":false}
,{"Fecha":1325372400000, "FK_TipoDato":1, "FK_Periodo":28, "Anyo":2012, "Valor":37198.0, "Secreto":false}
,{"Fecha":1293836400000, "FK_TipoDato":1, "FK_Periodo":28, "Anyo":2011, "Valor":35274.0, "Secreto":false}
,{"Fecha":1262300400000, "FK_TipoDato":1, "FK_Periodo":28, "Anyo":2010, "Valor":32650.0, "Secreto":false}
]
}
...
,{"COD":"DIR489440", "Nombre":"Melilla, Ciudad Autónoma de, De 200 a 499 asalariados, Total de empresas, Otra educación, Locales", "FK_Unidad":97, "FK_Escala":1, "Data":[{"Fecha":1735686000000, "FK_TipoDato":1, "FK_Periodo":28, "Anyo":2025, "Valor":0.0, "Secreto":false}
,{"Fecha":1704063600000, "FK_TipoDato":1, "FK_Periodo":28, "Anyo":2024, "Valor":1.0, "Secreto":false}
,{"Fecha":1672527600000, "FK_TipoDato":1, "FK_Periodo":28, "Anyo":2023, "Valor":0.0, "Secreto":false}
,{"Fecha":1640991600000, "FK_TipoDato":1, "FK_Periodo":28, "Anyo":2022, "Valor":0.0, "Secreto":false}
,{"Fecha":1609455600000, "FK_TipoDato":1, "FK_Periodo":28, "Anyo":2021, "Valor":0.0, "Secreto":false}
,{"Fecha":1577833200000, "FK_TipoDato":1, "FK_Periodo":28, "Anyo":2020, "Valor":0.0, "Secreto":false}
,{"Fecha":1546297200000, "FK_TipoDato":1, "FK_Periodo":28, "Anyo":2019, "Valor":0.0, "Secreto":false}
,{"Fecha":1514761200000, "FK_TipoDato":1, "FK_Periodo":28, "Anyo":2018, "Valor":0.0, "Secreto":false}
,{"Fecha":1483225200000, "FK_TipoDato":1, "FK_Periodo":28, "Anyo":2017, "Valor":0.0, "Secreto":false}
,{"Fecha":1451602800000, "FK_TipoDato":1, "FK_Periodo":28, "Anyo":2016, "Valor":0.0, "Secreto":false}
,{"Fecha":1420066800000, "FK_TipoDato":1, "FK_Periodo":28, "Anyo":2015, "Valor":0.0, "Secreto":false}
,{"Fecha":1388530800000, "FK_TipoDato":1, "FK_Periodo":28, "Anyo":2014, "Valor":0.0, "Secreto":false}
,{"Fecha":1356994800000, "FK_TipoDato":1, "FK_Periodo":28, "Anyo":2013, "Valor":0.0, "Secreto":false}
,{"Fecha":1325372400000, "FK_TipoDato":1, "FK_Periodo":28, "Anyo":2012, "Valor":0.0, "Secreto":false}
,{"Fecha":1293836400000, "FK_TipoDato":1, "FK_Periodo":28, "Anyo":2011, "Valor":0.0, "Secreto":false}
,{"Fecha":1262300400000, "FK_TipoDato":1, "FK_Periodo":28, "Anyo":2010, "Valor":0.0, "Secreto":false}
]
}
,{"COD":"DIR489106", "Nombre":"Melilla, Ciudad Autónoma de, De 500 o más asalariados, Total de empresas, Otra educación, Locales", "FK_Unidad":97, "FK_Escala":1, "Data":[{"Fecha":1735686000000, "FK_TipoDato":1, "FK_Periodo":28, "Anyo":2025, "Valor":1.0, "Secreto":false}
,{"Fecha":1704063600000, "FK_TipoDato":1, "FK_Periodo":28, "Anyo":2024, "Valor":0.0, "Secreto":false}
,{"Fecha":1672527600000, "FK_TipoDato":1, "FK_Periodo":28, "Anyo":2023, "Valor":0.0, "Secreto":false}
,{"Fecha":1640991600000, "FK_TipoDato":1, "FK_Periodo":28, "Anyo":2022, "Valor":0.0, "Secreto":false}
,{"Fecha":1609455600000, "FK_TipoDato":1, "FK_Periodo":28, "Anyo":2021, "Valor":0.0, "Secreto":false}
,{"Fecha":1577833200000, "FK_TipoDato":1, "FK_Periodo":28, "Anyo":2020, "Valor":0.0, "Secreto":false}
,{"Fecha":1546297200000, "FK_TipoDato":1, "FK_Periodo":28, "Anyo":2019, "Valor":0.0, "Secreto":false}
,{"Fecha":1514761200000, "FK_TipoDato":1, "FK_Periodo":28, "Anyo":2018, "Valor":0.0, "Secreto":false}
,{"Fecha":1483225200000, "FK_TipoDato":1, "FK_Periodo":28, "Anyo":2017, "Valor":0.0, "Secreto":false}
,{"Fecha":1451602800000, "FK_TipoDato":1, "FK_Periodo":28, "Anyo":2016, "Valor":0.0, "Secreto":false}
,{"Fecha":1420066800000, "FK_TipoDato":1, "FK_Periodo":28, "Anyo":2015, "Valor":0.0, "Secreto":false}
,{"Fecha":1388530800000, "FK_TipoDato":1, "FK_Periodo":28, "Anyo":2014, "Valor":0.0, "Secreto":false}
,{"Fecha":1356994800000, "FK_TipoDato":1, "FK_Periodo":28, "Anyo":2013, "Valor":0.0, "Secreto":false}
,{"Fecha":1325372400000, "FK_TipoDato":1, "FK_Periodo":28, "Anyo":2012, "Valor":0.0, "Secreto":false}
,{"Fecha":1293836400000, "FK_TipoDato":1, "FK_Periodo":28, "Anyo":2011, "Valor":0.0, "Secreto":false}
,{"Fecha":1262300400000, "FK_TipoDato":1, "FK_Periodo":28, "Anyo":2010, "Valor":0.0, "Secreto":false}
]
}
]
```

##### Number of other educational schools (Section P) companies municipality:

{"Id":4721, "Nombre":"Empresas por municipio y actividad principal", "Codigo":"NAC-MUN-PROV", "FK_Periodicidad":12, "FK_Publicacion":30, "FK_Periodo_ini":28, "Anyo_Periodo_ini":"2012", "FechaRef_fin":"null", "Ultima_Modificacion":1766397600000},

This one has different GROUP_TABLE values that aren't as specific, so the `tv=338:18326` filter will throw a 500 error. We need different filters:
`https://servicios.ine.es/wstempus/js/ES/DATOS_TABLA/4721?tv=491:23100` this gets values for Section-P CNAE classes
`https://servicios.ine.es/wstempus/js/ES/DATOS_TABLA/4721?tv=393:23092` this gets values for all CNAE classes

I'd like to gather data for both. The response for both looks like:
```
[{"COD":"DIR570478", "Nombre":"Total Nacional. Secciones P y Q. Total. Total de empresas. Empresas. ", "FK_Unidad":97, "FK_Escala":1, "Data":[{"Fecha":1735686000000, "FK_TipoDato":1, "FK_Periodo":28, "Anyo":2025, "Valor":294392.0, "Secreto":false}
,{"Fecha":1704063600000, "FK_TipoDato":1, "FK_Periodo":28, "Anyo":2024, "Valor":284876.0, "Secreto":false}
,{"Fecha":1672527600000, "FK_TipoDato":1, "FK_Periodo":28, "Anyo":2023, "Valor":277554.0, "Secreto":false}
,{"Fecha":1640991600000, "FK_TipoDato":1, "FK_Periodo":28, "Anyo":2022, "Valor":289734.0, "Secreto":false}
,{"Fecha":1609455600000, "FK_TipoDato":1, "FK_Periodo":28, "Anyo":2021, "Valor":278805.0, "Secreto":false}
,{"Fecha":1577833200000, "FK_TipoDato":1, "FK_Periodo":28, "Anyo":2020, "Valor":284502.0, "Secreto":false}
,{"Fecha":1546297200000, "FK_TipoDato":1, "FK_Periodo":28, "Anyo":2019, "Valor":272124.0, "Secreto":false}
,{"Fecha":1514761200000, "FK_TipoDato":1, "FK_Periodo":28, "Anyo":2018, "Valor":270235.0, "Secreto":false}
,{"Fecha":1483225200000, "FK_TipoDato":1, "FK_Periodo":28, "Anyo":2017, "Valor":262399.0, "Secreto":false}
,{"Fecha":1451602800000, "FK_TipoDato":1, "FK_Periodo":28, "Anyo":2016, "Valor":252362.0, "Secreto":false}
,{"Fecha":1420066800000, "FK_TipoDato":1, "FK_Periodo":28, "Anyo":2015, "Valor":241381.0, "Secreto":false}
,{"Fecha":1388530800000, "FK_TipoDato":1, "FK_Periodo":28, "Anyo":2014, "Valor":227053.0, "Secreto":false}
,{"Fecha":1356994800000, "FK_TipoDato":1, "FK_Periodo":28, "Anyo":2013, "Valor":223880.0, "Secreto":false}
,{"Fecha":1325372400000, "FK_TipoDato":1, "FK_Periodo":28, "Anyo":2012, "Valor":221559.0, "Secreto":false}
]
}
,{"COD":"DIR518745", "Nombre":"Araba/Álava. Total. Total de empresas. Empresas. Secciones P y Q. ", "FK_Unidad":97, "FK_Escala":1, "Data":[{"Fecha":1735686000000, "FK_TipoDato":1, "FK_Periodo":28, "Anyo":2025, "Valor":1621.0, "Secreto":false}
,{"Fecha":1704063600000, "FK_TipoDato":1, "FK_Periodo":28, "Anyo":2024, "Valor":1568.0, "Secreto":false}
,{"Fecha":1672527600000, "FK_TipoDato":1, "FK_Periodo":28, "Anyo":2023, "Valor":1510.0, "Secreto":false}
,{"Fecha":1640991600000, "FK_TipoDato":1, "FK_Periodo":28, "Anyo":2022, "Valor":1592.0, "Secreto":false}
,{"Fecha":1609455600000, "FK_TipoDato":1, "FK_Periodo":28, "Anyo":2021, "Valor":1587.0, "Secreto":false}
,{"Fecha":1577833200000, "FK_TipoDato":1, "FK_Periodo":28, "Anyo":2020, "Valor":1558.0, "Secreto":false}
,{"Fecha":1546297200000, "FK_TipoDato":1, "FK_Periodo":28, "Anyo":2019, "Valor":1493.0, "Secreto":false}
,{"Fecha":1514761200000, "FK_TipoDato":1, "FK_Periodo":28, "Anyo":2018, "Valor":1518.0, "Secreto":false}
,{"Fecha":1483225200000, "FK_TipoDato":1, "FK_Periodo":28, "Anyo":2017, "Valor":1432.0, "Secreto":false}
,{"Fecha":1451602800000, "FK_TipoDato":1, "FK_Periodo":28, "Anyo":2016, "Valor":1446.0, "Secreto":false}
,{"Fecha":1420066800000, "FK_TipoDato":1, "FK_Periodo":28, "Anyo":2015, "Valor":1410.0, "Secreto":false}
,{"Fecha":1388530800000, "FK_TipoDato":1, "FK_Periodo":28, "Anyo":2014, "Valor":1340.0, "Secreto":false}
,{"Fecha":1356994800000, "FK_TipoDato":1, "FK_Periodo":28, "Anyo":2013, "Valor":1329.0, "Secreto":false}
,{"Fecha":1325372400000, "FK_TipoDato":1, "FK_Periodo":28, "Anyo":2012, "Valor":1293.0, "Secreto":false}
]
}
,{"COD":"DIR413898", "Nombre":"Alegría-Dulantzi. Total. Total de empresas. Secciones P y Q. Empresas. ", "FK_Unidad":97, "FK_Escala":1, "Data":[]
}
,{"COD":"DIR413908", "Nombre":"Amurrio. Total. Total de empresas. Secciones P y Q. Empresas. ", "FK_Unidad":97, "FK_Escala":1, "Data":[{"Fecha":1735686000000, "FK_TipoDato":1, "FK_Periodo":28, "Anyo":2025, "Valor":41.0, "Secreto":false}
,{"Fecha":1704063600000, "FK_TipoDato":1, "FK_Periodo":28, "Anyo":2024, "Valor":46.0, "Secreto":false}
,{"Fecha":1672527600000, "FK_TipoDato":1, "FK_Periodo":28, "Anyo":2023, "Valor":44.0, "Secreto":false}
,{"Fecha":1640991600000, "FK_TipoDato":1, "FK_Periodo":28, "Anyo":2022, "Valor":46.0, "Secreto":false}
,{"Fecha":1609455600000, "FK_TipoDato":1, "FK_Periodo":28, "Anyo":2021, "Valor":47.0, "Secreto":false}
,{"Fecha":1577833200000, "FK_TipoDato":1, "FK_Periodo":28, "Anyo":2020, "Valor":44.0, "Secreto":false}
,{"Fecha":1546297200000, "FK_TipoDato":1, "FK_Periodo":28, "Anyo":2019, "Valor":40.0, "Secreto":false}
,{"Fecha":1514761200000, "FK_TipoDato":1, "FK_Periodo":28, "Anyo":2018, "Valor":40.0, "Secreto":false}
,{"Fecha":1483225200000, "FK_TipoDato":1, "FK_Periodo":28, "Anyo":2017, "Valor":41.0, "Secreto":false}
,{"Fecha":1451602800000, "FK_TipoDato":1, "FK_Periodo":28, "Anyo":2016, "Valor":40.0, "Secreto":false}
,{"Fecha":1420066800000, "FK_TipoDato":1, "FK_Periodo":28, "Anyo":2015, "Valor":40.0, "Secreto":false}
,{"Fecha":1388530800000, "FK_TipoDato":1, "FK_Periodo":28, "Anyo":2014, "Valor":36.0, "Secreto":false}
,{"Fecha":1356994800000, "FK_TipoDato":1, "FK_Periodo":28, "Anyo":2013, "Valor":38.0, "Secreto":false}
,{"Fecha":1325372400000, "FK_TipoDato":1, "FK_Periodo":28, "Anyo":2012, "Valor":39.0, "Secreto":false}
]
}
,{"COD":"DIR413918", "Nombre":"Aramaio. Total. Total de empresas. Secciones P y Q. Empresas. ", "FK_Unidad":97, "FK_Escala":1, "Data":[]
}
,{"COD":"DIR413928", "Nombre":"Artziniega. Total. Total de empresas. Secciones P y Q. Empresas. ", "FK_Unidad":97, "FK_Escala":1, "Data":[]
}
...
,{"COD":"DIR518455", "Nombre":"Melilla. Total. Total de empresas. Empresas. Secciones P y Q. ", "FK_Unidad":97, "FK_Escala":1, "Data":[{"Fecha":1735686000000, "FK_TipoDato":1, "FK_Periodo":28, "Anyo":2025, "Valor":403.0, "Secreto":false}
,{"Fecha":1704063600000, "FK_TipoDato":1, "FK_Periodo":28, "Anyo":2024, "Valor":389.0, "Secreto":false}
,{"Fecha":1672527600000, "FK_TipoDato":1, "FK_Periodo":28, "Anyo":2023, "Valor":367.0, "Secreto":false}
,{"Fecha":1640991600000, "FK_TipoDato":1, "FK_Periodo":28, "Anyo":2022, "Valor":380.0, "Secreto":false}
,{"Fecha":1609455600000, "FK_TipoDato":1, "FK_Periodo":28, "Anyo":2021, "Valor":377.0, "Secreto":false}
,{"Fecha":1577833200000, "FK_TipoDato":1, "FK_Periodo":28, "Anyo":2020, "Valor":396.0, "Secreto":false}
,{"Fecha":1546297200000, "FK_TipoDato":1, "FK_Periodo":28, "Anyo":2019, "Valor":403.0, "Secreto":false}
,{"Fecha":1514761200000, "FK_TipoDato":1, "FK_Periodo":28, "Anyo":2018, "Valor":394.0, "Secreto":false}
,{"Fecha":1483225200000, "FK_TipoDato":1, "FK_Periodo":28, "Anyo":2017, "Valor":365.0, "Secreto":false}
,{"Fecha":1451602800000, "FK_TipoDato":1, "FK_Periodo":28, "Anyo":2016, "Valor":355.0, "Secreto":false}
,{"Fecha":1420066800000, "FK_TipoDato":1, "FK_Periodo":28, "Anyo":2015, "Valor":336.0, "Secreto":false}
,{"Fecha":1388530800000, "FK_TipoDato":1, "FK_Periodo":28, "Anyo":2014, "Valor":285.0, "Secreto":false}
,{"Fecha":1356994800000, "FK_TipoDato":1, "FK_Periodo":28, "Anyo":2013, "Valor":302.0, "Secreto":false}
,{"Fecha":1325372400000, "FK_TipoDato":1, "FK_Periodo":28, "Anyo":2012, "Valor":291.0, "Secreto":false}
]
}
,{"COD":"DIR480389", "Nombre":"Melilla. Total. Total de empresas. Secciones P y Q. Empresas. ", "FK_Unidad":97, "FK_Escala":1, "Data":[{"Fecha":1735686000000, "FK_TipoDato":1, "FK_Periodo":28, "Anyo":2025, "Valor":403.0, "Secreto":false}
,{"Fecha":1704063600000, "FK_TipoDato":1, "FK_Periodo":28, "Anyo":2024, "Valor":389.0, "Secreto":false}
,{"Fecha":1672527600000, "FK_TipoDato":1, "FK_Periodo":28, "Anyo":2023, "Valor":367.0, "Secreto":false}
,{"Fecha":1640991600000, "FK_TipoDato":1, "FK_Periodo":28, "Anyo":2022, "Valor":380.0, "Secreto":false}
,{"Fecha":1609455600000, "FK_TipoDato":1, "FK_Periodo":28, "Anyo":2021, "Valor":377.0, "Secreto":false}
,{"Fecha":1577833200000, "FK_TipoDato":1, "FK_Periodo":28, "Anyo":2020, "Valor":396.0, "Secreto":false}
,{"Fecha":1546297200000, "FK_TipoDato":1, "FK_Periodo":28, "Anyo":2019, "Valor":403.0, "Secreto":false}
,{"Fecha":1514761200000, "FK_TipoDato":1, "FK_Periodo":28, "Anyo":2018, "Valor":394.0, "Secreto":false}
,{"Fecha":1483225200000, "FK_TipoDato":1, "FK_Periodo":28, "Anyo":2017, "Valor":365.0, "Secreto":false}
,{"Fecha":1451602800000, "FK_TipoDato":1, "FK_Periodo":28, "Anyo":2016, "Valor":355.0, "Secreto":false}
,{"Fecha":1420066800000, "FK_TipoDato":1, "FK_Periodo":28, "Anyo":2015, "Valor":336.0, "Secreto":false}
,{"Fecha":1388530800000, "FK_TipoDato":1, "FK_Periodo":28, "Anyo":2014, "Valor":285.0, "Secreto":false}
,{"Fecha":1356994800000, "FK_TipoDato":1, "FK_Periodo":28, "Anyo":2013, "Valor":302.0, "Secreto":false}
,{"Fecha":1325372400000, "FK_TipoDato":1, "FK_Periodo":28, "Anyo":2012, "Valor":291.0, "Secreto":false}
]
}
]
```

We also want the worker app to fetch these other sources, but these are not quite as critical. I haven' thought about the best tables/schemas for these queries, but I imagine they would focus on the Data param unix timestamp, year, and value.

Once again, we don't want to add unnecessary data that bloats the primary tables, and can reserve id columns to an ine_metadata table, which should be able to accomodate both the variable queries as well as the data_table queries.

#### 22: Cifras Oficiales de Población de los Municipios Españoles: Revisión del Padrón Municipal

##### Number of people per municipality:

{"Id":29005, "Nombre":"Cifras oficiales del padrón por municipio", "Codigo":"MUN", "FK_Periodicidad":12, "FK_Publicacion":29, "FK_Periodo_ini":28, "Anyo_Periodo_ini":"1996", "FechaRef_fin":"null", "Ultima_Modificacion":1765447200000},

`https://servicios.ine.es/wstempus/js/ES/DATOS_TABLA/29005?tv=18:451` this filters for total pop regardless of gender.

This returns a response like:
```
[{"COD":"DPOP19723", "Nombre":"Ababuj. Total. Total habitantes. Personas. ", "FK_Unidad":3, "FK_Escala":1, "Data":[{"Fecha":1735686000000, "FK_TipoDato":1, "FK_Periodo":28, "Anyo":2025, "Valor":73.0, "Secreto":false}
,{"Fecha":1704063600000, "FK_TipoDato":1, "FK_Periodo":28, "Anyo":2024, "Valor":74.0, "Secreto":false}
,{"Fecha":1672527600000, "FK_TipoDato":1, "FK_Periodo":28, "Anyo":2023, "Valor":70.0, "Secreto":false}
,{"Fecha":1640991600000, "FK_TipoDato":1, "FK_Periodo":28, "Anyo":2022, "Valor":72.0, "Secreto":false}
,{"Fecha":1609455600000, "FK_TipoDato":1, "FK_Periodo":28, "Anyo":2021, "Valor":76.0, "Secreto":false}
,{"Fecha":1577833200000, "FK_TipoDato":1, "FK_Periodo":28, "Anyo":2020, "Valor":77.0, "Secreto":false}
,{"Fecha":1546297200000, "FK_TipoDato":1, "FK_Periodo":28, "Anyo":2019, "Valor":73.0, "Secreto":false}
,{"Fecha":1514761200000, "FK_TipoDato":1, "FK_Periodo":28, "Anyo":2018, "Valor":76.0, "Secreto":false}
,{"Fecha":1483225200000, "FK_TipoDato":1, "FK_Periodo":28, "Anyo":2017, "Valor":73.0, "Secreto":false}
,{"Fecha":1451602800000, "FK_TipoDato":1, "FK_Periodo":28, "Anyo":2016, "Valor":76.0, "Secreto":false}
,{"Fecha":1420066800000, "FK_TipoDato":1, "FK_Periodo":28, "Anyo":2015, "Valor":73.0, "Secreto":false}
,{"Fecha":1388530800000, "FK_TipoDato":1, "FK_Periodo":28, "Anyo":2014, "Valor":65.0, "Secreto":false}
,{"Fecha":1356994800000, "FK_TipoDato":1, "FK_Periodo":28, "Anyo":2013, "Valor":65.0, "Secreto":false}
,{"Fecha":1325372400000, "FK_TipoDato":1, "FK_Periodo":28, "Anyo":2012, "Valor":73.0, "Secreto":false}
,{"Fecha":1293836400000, "FK_TipoDato":1, "FK_Periodo":28, "Anyo":2011, "Valor":78.0, "Secreto":false}
,{"Fecha":1262300400000, "FK_TipoDato":1, "FK_Periodo":28, "Anyo":2010, "Valor":77.0, "Secreto":false}
,{"Fecha":1230764400000, "FK_TipoDato":1, "FK_Periodo":28, "Anyo":2009, "Valor":80.0, "Secreto":false}
,{"Fecha":1199142000000, "FK_TipoDato":1, "FK_Periodo":28, "Anyo":2008, "Valor":83.0, "Secreto":false}
,{"Fecha":1167606000000, "FK_TipoDato":1, "FK_Periodo":28, "Anyo":2007, "Valor":82.0, "Secreto":false}
,{"Fecha":1136070000000, "FK_TipoDato":1, "FK_Periodo":28, "Anyo":2006, "Valor":84.0, "Secreto":false}
,{"Fecha":1104534000000, "FK_TipoDato":1, "FK_Periodo":28, "Anyo":2005, "Valor":84.0, "Secreto":false}
,{"Fecha":1072911600000, "FK_TipoDato":1, "FK_Periodo":28, "Anyo":2004, "Valor":89.0, "Secreto":false}
,{"Fecha":1041375600000, "FK_TipoDato":1, "FK_Periodo":28, "Anyo":2003, "Valor":85.0, "Secreto":false}
,{"Fecha":1009839600000, "FK_TipoDato":1, "FK_Periodo":28, "Anyo":2002, "Valor":88.0, "Secreto":false}
,{"Fecha":978303600000, "FK_TipoDato":1, "FK_Periodo":28, "Anyo":2001, "Valor":84.0, "Secreto":false}
,{"Fecha":946681200000, "FK_TipoDato":1, "FK_Periodo":28, "Anyo":2000, "Valor":85.0, "Secreto":false}
,{"Fecha":915145200000, "FK_TipoDato":1, "FK_Periodo":28, "Anyo":1999, "Valor":86.0, "Secreto":false}
,{"Fecha":883609200000, "FK_TipoDato":1, "FK_Periodo":28, "Anyo":1998, "Valor":86.0, "Secreto":false}
,{"Fecha":820450800000, "FK_TipoDato":1, "FK_Periodo":28, "Anyo":1996, "Valor":85.0, "Secreto":false}
]
}
,{"COD":"DPOP19724", "Nombre":"Ababuj. Hombres. Total habitantes. Personas. ", "FK_Unidad":3, "FK_Escala":1, "Data":[{"Fecha":1735686000000, "FK_TipoDato":1, "FK_Periodo":28, "Anyo":2025, "Valor":45.0, "Secreto":false}
,{"Fecha":1704063600000, "FK_TipoDato":1, "FK_Periodo":28, "Anyo":2024, "Valor":44.0, "Secreto":false}
,{"Fecha":1672527600000, "FK_TipoDato":1, "FK_Periodo":28, "Anyo":2023, "Valor":43.0, "Secreto":false}
,{"Fecha":1640991600000, "FK_TipoDato":1, "FK_Periodo":28, "Anyo":2022, "Valor":44.0, "Secreto":false}
,{"Fecha":1609455600000, "FK_TipoDato":1, "FK_Periodo":28, "Anyo":2021, "Valor":44.0, "Secreto":false}
,{"Fecha":1577833200000, "FK_TipoDato":1, "FK_Periodo":28, "Anyo":2020, "Valor":46.0, "Secreto":false}
,{"Fecha":1546297200000, "FK_TipoDato":1, "FK_Periodo":28, "Anyo":2019, "Valor":45.0, "Secreto":false}
,{"Fecha":1514761200000, "FK_TipoDato":1, "FK_Periodo":28, "Anyo":2018, "Valor":48.0, "Secreto":false}
,{"Fecha":1483225200000, "FK_TipoDato":1, "FK_Periodo":28, "Anyo":2017, "Valor":45.0, "Secreto":false}
,{"Fecha":1451602800000, "FK_TipoDato":1, "FK_Periodo":28, "Anyo":2016, "Valor":47.0, "Secreto":false}
,{"Fecha":1420066800000, "FK_TipoDato":1, "FK_Periodo":28, "Anyo":2015, "Valor":45.0, "Secreto":false}
,{"Fecha":1388530800000, "FK_TipoDato":1, "FK_Periodo":28, "Anyo":2014, "Valor":41.0, "Secreto":false}
,{"Fecha":1356994800000, "FK_TipoDato":1, "FK_Periodo":28, "Anyo":2013, "Valor":41.0, "Secreto":false}
,{"Fecha":1325372400000, "FK_TipoDato":1, "FK_Periodo":28, "Anyo":2012, "Valor":43.0, "Secreto":false}
,{"Fecha":1293836400000, "FK_TipoDato":1, "FK_Periodo":28, "Anyo":2011, "Valor":48.0, "Secreto":false}
,{"Fecha":1262300400000, "FK_TipoDato":1, "FK_Periodo":28, "Anyo":2010, "Valor":49.0, "Secreto":false}
,{"Fecha":1230764400000, "FK_TipoDato":1, "FK_Periodo":28, "Anyo":2009, "Valor":52.0, "Secreto":false}
,{"Fecha":1199142000000, "FK_TipoDato":1, "FK_Periodo":28, "Anyo":2008, "Valor":52.0, "Secreto":false}
,{"Fecha":1167606000000, "FK_TipoDato":1, "FK_Periodo":28, "Anyo":2007, "Valor":51.0, "Secreto":false}
,{"Fecha":1136070000000, "FK_TipoDato":1, "FK_Periodo":28, "Anyo":2006, "Valor":51.0, "Secreto":false}
,{"Fecha":1104534000000, "FK_TipoDato":1, "FK_Periodo":28, "Anyo":2005, "Valor":49.0, "Secreto":false}
,{"Fecha":1072911600000, "FK_TipoDato":1, "FK_Periodo":28, "Anyo":2004, "Valor":53.0, "Secreto":false}
,{"Fecha":1041375600000, "FK_TipoDato":1, "FK_Periodo":28, "Anyo":2003, "Valor":49.0, "Secreto":false}
,{"Fecha":1009839600000, "FK_TipoDato":1, "FK_Periodo":28, "Anyo":2002, "Valor":51.0, "Secreto":false}
,{"Fecha":978303600000, "FK_TipoDato":1, "FK_Periodo":28, "Anyo":2001, "Valor":48.0, "Secreto":false}
,{"Fecha":946681200000, "FK_TipoDato":1, "FK_Periodo":28, "Anyo":2000, "Valor":48.0, "Secreto":false}
,{"Fecha":915145200000, "FK_TipoDato":1, "FK_Periodo":28, "Anyo":1999, "Valor":49.0, "Secreto":false}
,{"Fecha":883609200000, "FK_TipoDato":1, "FK_Periodo":28, "Anyo":1998, "Valor":48.0, "Secreto":false}
,{"Fecha":820450800000, "FK_TipoDato":1, "FK_Periodo":28, "Anyo":1996, "Valor":50.0, "Secreto":false}
]
}
...
```

##### Number of people per island (if we choose to use them):

{"Id":2910, "Nombre":"Población por islas y sexo", "Codigo":"PROV", "FK_Periodicidad":12, "FK_Publicacion":29, "FK_Periodo_ini":28, "Anyo_Periodo_ini":"1996", "FK_Periodo_fin":28, "Anyo_Periodo_fin":"2021", "Ultima_Modificacion":1640253600000},

`https://servicios.ine.es/wstempus/js/ES/DATOS_TABLA/2910?tv=18:451` Again only looking a total pop regardless of gender

#### 353: Atlas de distribución de renta de los hogares


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