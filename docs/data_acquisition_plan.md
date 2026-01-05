# Data Acquisition & Management Plan

## Objective

To build the most comprehensive, accurate, and useful dataset of Spanish driving schools (autoescuelas) by synthesizing official government records with geospatial data and third-party enrichment.

## 1. The Foundation: NIE Location Data

ALL DONE

## 2. Location Refinement: CartoCiudad API

Find out how the CartoCiudad API works
Find out what data structure(s) their responses follow (I believe they use .gpkg, how will that fit into our db? Do we use PostGIS?)
Sample and explore the CartoCiudad data to see what to include in our db

## 3. The Business Core: Autoescuela Registry (DGT)

A. Implement the reference python scripts in the root (`dgt_scraper.py` and `exam_scraper.py`) within `apps/worker` using TypeScript. Make sure they adhere with the schemas defined by the NIE and CNIG data.
B. Normalization: - Scraper fetches a school - Worker attempts to match school data against `municipalities` table (e.g., "Alcalá de Henares"). - If match found: Link via Foreign Key. - If no match: Flag for review.

## 4. The Polish: Enrichment (Places API)

Once DGT school data is validated, the `apps/worker` can queries Google Places API for metadata (images, reviews) and elaborate the school data. - Consider creating new tables for large files with foreign keys to `schools`.
