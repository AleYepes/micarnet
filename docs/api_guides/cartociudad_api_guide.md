# CartoCiudad API & Data Analysis

## 1. API Overview

- **Base URL**: `https://www.cartociudad.es/geocoder/api/geocoder`
- **Key Endpoints**:
  - `/candidates`: Fuzzy search for addresses. Returns a list of candidates with coordinates (lat/lng), INE codes (municipality), and postal codes.
  - `/find`: Exact match search.
  - `/reverseGeocode`: Get address from coordinates.

## 2. Data Structure (API Response)

The API returns a JSON array of objects. Key fields for our schema:

- `muniCode`: Corresponds to the INE Municipality Code (matches our `geo` schema).
- `postalCode`: Useful for filtering.
- `lat`, `lng`: WGS84 coordinates (Latitude/Longitude).
- `refCatastral`: Cadastral reference (potentially useful for unique ID).
- `address`: Normalized address string.

**Sample Response:**
`https://www.cartociudad.es/geocoder/api/geocoder/candidates?q=CALLE%20ALCALA%201,%20Madrid`

```json
[
  {
    "id": "13.PV.MUN_280790039568",
    "province": "Madrid",
    "provinceCode": "28",
    "comunidadAutonoma": "Comunidad de Madrid",
    "comunidadAutonomaCode": "13",
    "muni": "Madrid",
    "muniCode": "28079",
    "type": "portal",
    "address": "CALLE ALCALA 1, Madrid",
    "postalCode": "28014",
    "poblacion": "Madrid",
    "geom": null,
    "tip_via": "CALLE",
    "lat": 40.417276795173,
    "lng": -3.70226055446815,
    "portalNumber": 1,
    "noNumber": false,
    "stateMsg": "",
    "extension": null,
    "state": 0,
    "refCatastral": "0545206VK4704F",
    "countryCode": "011"
  },
  {
    "id": "13.PV.MUN_280790038935",
    "province": "Madrid",
    "provinceCode": "28",
    "comunidadAutonoma": "Comunidad de Madrid",
    "comunidadAutonomaCode": "13",
    "muni": "Madrid",
    "muniCode": "28079",
    "type": "portal",
    "address": "CALLE ALCALA GALIANO 1, Madrid",
    "postalCode": "28010",
    "poblacion": "Madrid",
    "geom": null,
    "tip_via": "CALLE",
    "lat": 40.426948779888,
    "lng": -3.6920994262733,
    "portalNumber": 1,
    "noNumber": false,
    "stateMsg": "",
    "extension": null,
    "state": 0,
    "refCatastral": "1456909VK4715E",
    "countryCode": "011"
  },
...
  {
    "id": "SEIG_C_1328018828",
    "province": "Madrid",
    "provinceCode": "28",
    "comunidadAutonoma": "Comunidad de Madrid",
    "comunidadAutonomaCode": "13",
    "muni": "Madrid",
    "muniCode": "28079",
    "type": "toponimo",
    "address": "CLINICAS VIVANTA, S.L.U. [CALLE DE LA RAZA 1 (ESQ. ALCAL], Madrid",
    "postalCode": "28022",
    "poblacion": "Madrid",
    "geom": null,
    "tip_via": "Clínica dental",
    "lat": 40.4470799999961,
    "lng": -3.61187369999998,
    "portalNumber": null,
    "noNumber": null,
    "stateMsg": "",
    "extension": null,
    "state": 0,
    "refCatastral": null,
    "countryCode": "011"
  }
]
```
