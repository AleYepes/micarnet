# DGT Sample Resources

Header A:

```
https://services3.arcgis.com/TXNiwnLDifb5lMaR/ArcGIS/rest/services/Limite_admin_prov/FeatureServer/0/query?where=OBJECTID%3D20&objectIds=&time=&geometry=&geometryType=esriGeometryEnvelope&inSR=&spatialRel=esriSpatialRelIntersects&resultType=none&distance=0.0&units=esriSRUnit_Meter&returnGeodetic=false&outFields=&returnGeometry=true&featureEncoding=esriDefault&multipatchOption=xyFootprint&maxAllowableOffset=&geometryPrecision=&outSR=&datumTransformation=&applyVCSProjection=false&returnIdsOnly=false&returnUniqueIdsOnly=false&returnCountOnly=false&returnExtentOnly=false&returnQueryGeometry=false&returnDistinctValues=false&cacheHint=false&orderByFields=&groupByFieldsForStatistics=&outStatistics=&having=&resultOffset=&resultRecordCount=&returnZ=false&returnM=false&returnExceededLimitFeatures=true&quantizationParameters=&sqlFormat=none&f=pjson&token=
```

Response A:

```
{
  "objectIdFieldName" : "OBJECTID",
  "uniqueIdField" :
  {
    "name" : "OBJECTID",
    "isSystemMaintained" : true
  },
  "globalIdFieldName" : "",
  "geometryProperties" :
  {
    "shapeAreaFieldName" : "Shape__Area",
    "shapeLengthFieldName" : "Shape__Length",
    "units" : "esriMeters"
  },
  "geometryType" : "esriGeometryPolygon",
  "spatialReference" : {
    "wkid" : 102100,
    "latestWkid" : 3857
  },
  "fields" : [
    {
      "name" : "NAMEUNIT",
      "type" : "esriFieldTypeString",
      "alias" : "NAMEUNIT",
      "sqlType" : "sqlTypeOther",
      "length" : 128,
      "domain" : null,
      "defaultValue" : null
    }
  ],
  "features" : [
    {
      "attributes" : {
        "NAMEUNIT" : "Navarra"
      },
      "geometry" :
      {
        "rings" :
        [
          [
            [-212535.482099999, 5169839.8756],
            [-212316.446600001, 5170030.1699],
            [-212208.761599999, 5170034.1883],
            [-212211.486699998, 5170136.8541],
            // ... thousands more points, probably for a province Polygon ...
            [-131472.477499999, 5223852.1961],
            [-131535.449900001, 5223944.5346],
            [-131662.269400001, 5224278.6111],
            [-131671.0748, 5224690.2891]
          ]
        ]
      }
    }
  ]
}
```

Header B:

```
https://services3.arcgis.com/TXNiwnLDifb5lMaR/arcgis/rest/services/Autoescuela_pre/FeatureServer/0/query?where=cod_ine%3D%2731%27&objectIds=&time=&geometry=&geometryType=esriGeometryEnvelope&inSR=&spatialRel=esriSpatialRelIntersects&resultType=none&distance=0.0&units=esriSRUnit_Meter&returnGeodetic=false&outFields=*&returnGeometry=false&featureEncoding=esriDefault&multipatchOption=xyFootprint&maxAllowableOffset=&geometryPrecision=&outSR=&datumTransformation=&applyVCSProjection=false&returnIdsOnly=false&returnUniqueIdsOnly=false&returnCountOnly=false&returnExtentOnly=false&returnQueryGeometry=false&returnDistinctValues=true&cacheHint=false&orderByFields=&groupByFieldsForStatistics=&outStatistics=&having=&resultOffset=&resultRecordCount=&returnZ=false&returnM=false&returnExceededLimitFeatures=true&quantizationParameters=&sqlFormat=none&f=pjson&token=
```

Response B:

```
{
  "objectIdFieldName" : "OBJECTID",
  "uniqueIdField" :
  {
    "name" : "OBJECTID",
    "isSystemMaintained" : true
  },
  "globalIdFieldName" : "",
  "geometryType" : "esriGeometryPoint",
  "spatialReference" : {
    "wkid" : 4326,
    "latestWkid" : 4326
  },
  "fields" : [
    {
      "name" : "OBJECTID",
      "type" : "esriFieldTypeOID",
      "alias" : "OBJECTID",
      "sqlType" : "sqlTypeOther",
      "domain" : null,
      "defaultValue" : null
    },
    {
      "name" : "id",
      "type" : "esriFieldTypeInteger",
      "alias" : "id",
      "sqlType" : "sqlTypeOther",
      "domain" : null,
      "defaultValue" : null
    },
    {
      "name" : "tipo_elemento",
      "type" : "esriFieldTypeString",
      "alias" : "tipo_elemento",
      "sqlType" : "sqlTypeOther",
      "length" : 8000,
      "domain" : null,
      "defaultValue" : null
    },
    {
      "name" : "codigo_centro",
      "type" : "esriFieldTypeString",
      "alias" : "codigo_centro",
      "sqlType" : "sqlTypeOther",
      "length" : 8000,
      "domain" : null,
      "defaultValue" : null
    },
    {
      "name" : "comunidad",
      "type" : "esriFieldTypeString",
      "alias" : "comunidad",
      "sqlType" : "sqlTypeOther",
      "length" : 8000,
      "domain" : null,
      "defaultValue" : null
    },
    {
      "name" : "provincia",
      "type" : "esriFieldTypeString",
      "alias" : "provincia",
      "sqlType" : "sqlTypeOther",
      "length" : 8000,
      "domain" : null,
      "defaultValue" : null
    },
    {
      "name" : "municipio",
      "type" : "esriFieldTypeString",
      "alias" : "municipio",
      "sqlType" : "sqlTypeOther",
      "length" : 8000,
      "domain" : null,
      "defaultValue" : null
    },
    {
      "name" : "nombre",
      "type" : "esriFieldTypeString",
      "alias" : "nombre",
      "sqlType" : "sqlTypeOther",
      "length" : 8000,
      "domain" : null,
      "defaultValue" : null
    },
    {
      "name" : "direccion",
      "type" : "esriFieldTypeString",
      "alias" : "direccion",
      "sqlType" : "sqlTypeOther",
      "length" : 8000,
      "domain" : null,
      "defaultValue" : null
    },
    {
      "name" : "codigo_postal",
      "type" : "esriFieldTypeInteger",
      "alias" : "codigo_postal",
      "sqlType" : "sqlTypeOther",
      "domain" : null,
      "defaultValue" : null
    },
    {
      "name" : "telefono",
      "type" : "esriFieldTypeInteger",
      "alias" : "telefono",
      "sqlType" : "sqlTypeOther",
      "domain" : null,
      "defaultValue" : null
    },
    {
      "name" : "movil",
      "type" : "esriFieldTypeString",
      "alias" : "movil",
      "sqlType" : "sqlTypeOther",
      "length" : 8000,
      "domain" : null,
      "defaultValue" : null
    },
    {
      "name" : "fax",
      "type" : "esriFieldTypeString",
      "alias" : "fax",
      "sqlType" : "sqlTypeOther",
      "length" : 8000,
      "domain" : null,
      "defaultValue" : null
    },
    {
      "name" : "latitud",
      "type" : "esriFieldTypeDouble",
      "alias" : "latitud",
      "sqlType" : "sqlTypeOther",
      "domain" : null,
      "defaultValue" : null
    },
    {
      "name" : "longitud",
      "type" : "esriFieldTypeDouble",
      "alias" : "longitud",
      "sqlType" : "sqlTypeOther",
      "domain" : null,
      "defaultValue" : null
    },
    {
      "name" : "web",
      "type" : "esriFieldTypeString",
      "alias" : "web",
      "sqlType" : "sqlTypeOther",
      "length" : 8000,
      "domain" : null,
      "defaultValue" : null
    },
    {
      "name" : "email",
      "type" : "esriFieldTypeString",
      "alias" : "email",
      "sqlType" : "sqlTypeOther",
      "length" : 8000,
      "domain" : null,
      "defaultValue" : null
    },
    {
      "name" : "info",
      "type" : "esriFieldTypeString",
      "alias" : "info",
      "sqlType" : "sqlTypeOther",
      "length" : 8000,
      "domain" : null,
      "defaultValue" : null
    },
    {
      "name" : "extra1",
      "type" : "esriFieldTypeString",
      "alias" : "extra1",
      "sqlType" : "sqlTypeOther",
      "length" : 8000,
      "domain" : null,
      "defaultValue" : null
    },
    {
      "name" : "extra2",
      "type" : "esriFieldTypeString",
      "alias" : "extra2",
      "sqlType" : "sqlTypeOther",
      "length" : 8000,
      "domain" : null,
      "defaultValue" : null
    },
    {
      "name" : "cod_ine",
      "type" : "esriFieldTypeInteger",
      "alias" : "cod_ine",
      "sqlType" : "sqlTypeOther",
      "domain" : null,
      "defaultValue" : null
    }
  ],
  "features" : [
    {
      "attributes" : {
        "OBJECTID" : 227714,
        "id" : 16543,
        "tipo_elemento" : "AUTOESCUELA",
        "codigo_centro" : "NA017601",
        "comunidad" : "NAVARRA",
        "provincia" : "NAVARRA",
        "municipio" : "Pamplona/Iruña",
        "nombre" : "MOTOLOBI",
        "direccion" : "TAJONAR 10",
        "codigo_postal" : 31006,
        "telefono" : 675300700,
        "movil" : null,
        "fax" : null,
        "latitud" : 42.80554223,
        "longitud" : -1.635462333,
        "web" : null,
        "email" : null,
        "info" : null,
        "extra1" : null,
        "extra2" : null,
        "cod_ine" : 31
      }
    },
    {
      "attributes" : {
        "OBJECTID" : 227715,
        "id" : 16544,
        "tipo_elemento" : "AUTOESCUELA",
        "codigo_centro" : "NA017602",
        "comunidad" : "NAVARRA",
        "provincia" : "NAVARRA",
        "municipio" : "TAFALLA",
        "nombre" : "MOTOLOBI",
        "direccion" : "MAYOR 14-16",
        "codigo_postal" : 31001,
        "telefono" : 666111596,
        "movil" : null,
        "fax" : null,
        "latitud" : 42.81821785,
        "longitud" : -1.646245175,
        "web" : null,
        "email" : null,
        "info" : null,
        "extra1" : null,
        "extra2" : null,
        "cod_ine" : 31
      }
    },
    // ... many other schools ...
    {
      "attributes" : {
        "OBJECTID" : 229508,
        "id" : 16175,
        "tipo_elemento" : "AUTOESCUELA",
        "codigo_centro" : "NA013601",
        "comunidad" : "NAVARRA",
        "provincia" : "NAVARRA",
        "municipio" : "ANSOAIN",
        "nombre" : "INTEGRAL COM",
        "direccion" : "SAKANPEA 2 BJ",
        "codigo_postal" : 31013,
        "telefono" : 653921689,
        "movil" : null,
        "fax" : null,
        "latitud" : 42.83247,
        "longitud" : -1.64204,
        "web" : null,
        "email" : null,
        "info" : "B  ",
        "extra1" : null,
        "extra2" : null,
        "cod_ine" : 31
      }
    },
    {
      "attributes" : {
        "OBJECTID" : 229509,
        "id" : 16176,
        "tipo_elemento" : "AUTOESCUELA",
        "codigo_centro" : "NA014001",
        "comunidad" : "NAVARRA",
        "provincia" : "NAVARRA",
        "municipio" : "BURLADA",
        "nombre" : "AURRERA",
        "direccion" : "MAYOR 17",
        "codigo_postal" : 31600,
        "telefono" : null,
        "movil" : null,
        "fax" : null,
        "latitud" : 42.8239757,
        "longitud" : -1.6186488,
        "web" : null,
        "email" : null,
        "info" : "B  ",
        "extra1" : null,
        "extra2" : null,
        "cod_ine" : 31
      }
    }
  ]
}
```

Header C:

```
https://services3.arcgis.com/TXNiwnLDifb5lMaR/ArcGIS/rest/services/Limite_admin_muni/FeatureServer/0/query?where=SUBSTRING%28COD_INE,0,3%29%3D%2731%27&objectIds=&time=&geometry=&geometryType=esriGeometryEnvelope&inSR=&spatialRel=esriSpatialRelIntersects&resultType=none&distance=0.0&units=esriSRUnit_Meter&returnGeodetic=false&outFields=*&returnGeometry=false&featureEncoding=esriDefault&multipatchOption=xyFootprint&maxAllowableOffset=&geometryPrecision=&outSR=&datumTransformation=&applyVCSProjection=false&returnIdsOnly=false&returnUniqueIdsOnly=false&returnCountOnly=false&returnExtentOnly=false&returnQueryGeometry=false&returnDistinctValues=true&cacheHint=false&orderByFields=&groupByFieldsForStatistics=&outStatistics=&having=&resultOffset=&resultRecordCount=&returnZ=false&returnM=false&returnExceededLimitFeatures=true&quantizationParameters=&sqlFormat=none&f=pjson&token=
```

Response C:

```
{
  "objectIdFieldName" : "OBJECTID",
  "uniqueIdField" :
  {
    "name" : "OBJECTID",
    "isSystemMaintained" : true
  },
  "globalIdFieldName" : "",
  "geometryType" : "esriGeometryPolygon",
  "spatialReference" : {
    "wkid" : 102100,
    "latestWkid" : 3857
  },
  "fields" : [
    {
      "name" : "OBJECTID",
      "type" : "esriFieldTypeOID",
      "alias" : "OBJECTID",
      "sqlType" : "sqlTypeOther",
      "domain" : null,
      "defaultValue" : null
    },
    {
      "name" : "NAMEUNIT",
      "type" : "esriFieldTypeString",
      "alias" : "NAMEUNIT",
      "sqlType" : "sqlTypeOther",
      "length" : 128,
      "domain" : null,
      "defaultValue" : null
    },
    {
      "name" : "COD_INE",
      "type" : "esriFieldTypeString",
      "alias" : "COD_INE",
      "sqlType" : "sqlTypeOther",
      "length" : 6,
      "domain" : null,
      "defaultValue" : null
    },
    {
      "name" : "Shape__Area",
      "type" : "esriFieldTypeDouble",
      "alias" : "Shape__Area",
      "sqlType" : "sqlTypeDouble",
      "domain" : null,
      "defaultValue" : null
    },
    {
      "name" : "Shape__Length",
      "type" : "esriFieldTypeDouble",
      "alias" : "Shape__Length",
      "sqlType" : "sqlTypeDouble",
      "domain" : null,
      "defaultValue" : null
    }
  ],
  "features" : [
    {
      "attributes" : {
        "OBJECTID" : 4924,
        "NAMEUNIT" : "Castejón",
        "COD_INE" : "31070",
        "Shape__Area" : 75287587.08203125,
        "Shape__Length" : 36979.229215416737
      }
    },
    {
      "attributes" : {
        "OBJECTID" : 5654,
        "NAMEUNIT" : "Desojo",
        "COD_INE" : "31079",
        "Shape__Area" : 25553540.002319336,
        "Shape__Length" : 25027.981132473527
      }
    },
    {
      "attributes" : {
        "OBJECTID" : 5812,
        "NAMEUNIT" : "Bardenas Reales",
        "COD_INE" : "31817",
        "Shape__Area" : 765482043.539856,
        "Shape__Length" : 235107.06953965186
      }
    },
    // ... lots of municipalities ...
    {
      "attributes" : {
        "OBJECTID" : 7863,
        "NAMEUNIT" : "Arróniz",
        "COD_INE" : "31036",
        "Shape__Area" : 101790149.13110352,
        "Shape__Length" : 45072.522432035636
      }
    },
    {
      "attributes" : {
        "OBJECTID" : 7880,
        "NAMEUNIT" : "Orísoain",
        "COD_INE" : "31197",
        "Shape__Area" : 13304212.51385498,
        "Shape__Length" : 15301.323191211593
      }
    }
  ]
}
```

Header D:

```
https://services3.arcgis.com/TXNiwnLDifb5lMaR/ArcGIS/rest/services/Limite_admin_prov/FeatureServer/0/query?where=OBJECTID%3D20&objectIds=&time=&geometry=&geometryType=esriGeometryEnvelope&inSR=&spatialRel=esriSpatialRelIntersects&resultType=none&distance=0.0&units=esriSRUnit_Meter&returnGeodetic=false&outFields=*&returnGeometry=true&returnCentroid=true&featureEncoding=esriDefault&multipatchOption=xyFootprint&maxAllowableOffset=&geometryPrecision=&outSR=&datumTransformation=&applyVCSProjection=false&returnIdsOnly=false&returnUniqueIdsOnly=false&returnCountOnly=false&returnExtentOnly=true&returnQueryGeometry=false&returnDistinctValues=false&cacheHint=false&orderByFields=&groupByFieldsForStatistics=&outStatistics=&having=&resultOffset=&resultRecordCount=&returnZ=false&returnM=false&returnExceededLimitFeatures=true&quantizationParameters=&sqlFormat=none&f=pjson&token=
```

Response D (probably UI boudaries for the map):

```
{"extent" : {
    "xmin" : -278307.9331,
    "ymin" : 5147491.5020999983,
    "xmax" : -80589.793299999088,
    "ymax" : 5360009.805,
    "spatialReference" : {
      "wkid" : 102100,
      "latestWkid" : 3857
    }
  }
}
```

Header E:

```
https://basemaps.arcgis.com/arcgis/rest/services/World_Basemap_v2/VectorTileServer/tile/8/100/125.pbf
```

These are for various .pbf files with seemingly incripted contents. I imagine dev tools simply can't read the file type. I do see some strings in the files that look like titles:

- Graticule/label
- Spot elevation
- City small scale

Header F:

```
https://services3.arcgis.com/TXNiwnLDifb5lMaR/arcgis/rest/services/Autoescuela_pre/FeatureServer/0/query?f=pbf&geometry=%7B%22spatialReference%22%3A%7B%22wkid%22%3A102100%7D%2C%22xmin%22%3A-469629.101786986%2C%22ymin%22%3A4226661.916058987%2C%22xmax%22%3A-313086.06785898283%2C%22ymax%22%3A4383204.949986987%7D&maxRecordCountFactor=3&outFields=*&outSR=102100&quantizationParameters=%7B%22extent%22%3A%7B%22spatialReference%22%3A%7B%22wkid%22%3A102100%7D%2C%22xmin%22%3A-469629.101786986%2C%22ymin%22%3A4226661.916058987%2C%22xmax%22%3A-313086.06785898283%2C%22ymax%22%3A4383204.949986987%7D%2C%22mode%22%3A%22view%22%2C%22originPosition%22%3A%22upperLeft%22%2C%22tolerance%22%3A305.74811314062526%7D&resultType=tile&returnExceededLimitFeatures=false&spatialRel=esriSpatialRelIntersects&where=1%3D1&geometryType=esriGeometryEnvelope&inSR=102100
```

Another set of requests, but with differently formatted headers, that may return .pbf files.
I'm not sure if these, or the E headers are fetching vector/raster images for the map. If that's the case, we can go without them. If the .pbf files store Polygons, they may be useful.
