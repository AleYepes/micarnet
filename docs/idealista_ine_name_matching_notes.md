# Idealista / INE Name Matching Notes

Idealista depth-0 region names are province-like labels, but they append `provincia` to Spanish provinces, for example `La Rioja provincia`. The same depth also includes non-Spain border/search regions such as `Andorra provincia`, `Gibraltar provincia`, `Cerdanya Francesa provincia`, and `País Vasco Francés provincia`; these should not match `geo.provinces`.

The INE-sourced Postgres province names have formatting quirks:

- Leading articles may be moved to the end: `Rioja, La`, `Palmas, Las`, `Coruña, A`.
- Bilingual names may be slash-separated: `Castellón/Castelló`, `Alicante/Alacant`, `Valencia/València`, `Araba/Álava`.
- Some names use official local-language forms rather than Idealista/common Spanish forms: `Bizkaia` vs `Vizcaya`, `Gipuzkoa` vs `Guipúzcoa`.
- Parenthetical/comma variants may refer to the same name parts: `Balears (Illes) provincia` vs `Balears, Illes`.

Recommended matching order:

1. Normalize case, accents, punctuation, whitespace, and remove administrative suffixes like `provincia`.
2. Generate dynamic variants for comma-article inversion, slash alternatives, and parenthetical text.
3. Match on variant intersection.
4. Use a tiny explicit alias map only for true name differences, currently `Bizkaia`/`Vizcaya` and `Gipuzkoa`/`Guipúzcoa`.

## Current Data Shape

The Idealista snapshot currently has 13,818 regions:

```txt
tree_depth 0:    56
tree_depth 1:   423
tree_depth 2: 8,525
tree_depth 3: 3,226
tree_depth 4: 1,588
```

The four non-Spain roots are:

- `cpH`: Cerdanya Francesa provincia
- `cql`: Gibraltar provincia
- `dME`: Andorra provincia
- `dNy`: País Vasco Francés provincia

Their full descendant branches contain 254 regions:

```txt
depth 0:   4
depth 1:  14
depth 2: 202
depth 3:  34
```

Therefore, skip logs containing `parent_province_skipped: 14` and `parent_context_skipped: 202` are expected when those roots are excluded.

## Normalization Findings

Province matching should be deterministic. Do not use fuzzy matching for provinces.

The original article-inversion regex was greedy:

```txt
^(.*)[\s,]+\(?(\w{1,3}|illes)\)?$
```

It mishandled names such as `Coruña, A` because the first group captured `Coruña,`, yielding `a coruna,`. The current regex should remain non-greedy:

```txt
^(.*?)[\s,]+\(?(\w{1,3}|illes)\)?$
```

`getNameVariants()` must generate variants before slash punctuation is discarded. Otherwise names such as `Alicante/Alacant`, `Valencia/València`, and `Araba/Álava` lose their useful alternatives.

## Idealista Depth Is Not Table Role

Depth 0 is reliably province-like. After depth 0, Idealista hierarchy does not map directly to the DB hierarchy.

Depth 1 can be:

- an INE comarca-like region
- an Idealista-only context/grouping
- occasionally a municipality

An exact variant check against the current INE tables found roughly:

```txt
depth 1 exact comarca only:       69
depth 1 exact municipality only:  27
depth 1 exact both:                7
depth 1 exact neither:           306
```

So the importer should treat depth 1 as a province-scoped context by default, not as an official comarca by default. If it matches an INE comarca, attach the `comarcaId`, but do not hard-restrict child municipality matching to that comarca because Idealista group boundaries and INE comarca boundaries often differ.

## Current Importer Observations

After the role-aware importer ran on a fresh DB, the output was:

```txt
Idealista provinces matched: 52
Idealista contexts matched to INE comarcas: 108
Context-only groups: 297
Idealista municipalities matched: 7,981
Idealista districts imported: 8,160
Idealista neighborhoods imported: 11,751
```

Compared against the snapshot, regions not stored in any geo table were:

```txt
missing total:         1,157
outside-Spain missing:   254
Spanish missing:         903
```

Spanish missing by depth:

```txt
depth 1: 299
depth 2: 342
depth 3: 130
depth 4: 132
```

The 299 Spanish depth-1 missing regions are mostly context-only Idealista groups that were resolved in memory but not persisted. To make every Spanish Idealista region addressable, persist these as derived, non-INE comarca/context rows rather than only keeping them in memory.

The 342 Spanish depth-2 misses split into:

```txt
leaf nodes:   321
branch nodes:  21
```

Examples of missed depth-2 leaves:

- `Ceinos`
- `Collado`
- `Alcossebre`
- `Chert`
- `Salsadella`

Examples of missed depth-2 branches:

- `Empuriabrava`
- `Castell-Platja d'Aro`
- `Calonge`
- `Palma de Mallorca`
- `Alicante / Alacant`
- `Sotogrande`
- `La Moraleja`

These branches are mixed: some are official municipalities with name variants, and some are submunicipal/tourism/locality regions.

## Fuzzy Matching Risk

Municipality fuzzy matching is currently too permissive. One observed bad match was:

```txt
Idealista: Alicante / Alacant
Matched INE row: Gran Alacant
```

This incorrectly assigned the main Alicante region to the `Gran Alacant` municipality/locality row. Similar risks exist when a short official name is contained inside a longer locality name, or vice versa.

For municipality matching:

1. Prefer exact variant intersection.
2. Use fuzzy matching only with stricter guards.
3. Avoid fuzzy matches where one name is a strict locality-style elaboration of the other, unless the primary tokens align strongly.
4. Prefer same province always.
5. Prefer same comarca only as a score boost, not a hard filter.
6. Log matches outside the expected INE comarca as `outside_context_comarca`; these can be valid.

## Comarca Geometry

The INE sync creates 52 placeholder comarcas with IDs `-1` through `-52`, one negative ID per province. This is intentional. They provide a non-null `municipalities.comarca_id` fallback for municipalities whose INE parent list contains no comarca.

After the latest run:

```txt
comarcas total:                  378
placeholder comarcas:             52
placeholder comarcas referenced:   8
comarcas with null geometry:     272
```

Most official INE comarcas having `geometry = null` is not necessarily a bug. Idealista depth-1 regions do not consistently represent INE comarcas. Do not force every official INE comarca to have an Idealista polygon unless a reliable match exists.

## Recommended Next Import Rules

1. Match depth-0 provinces deterministically by variant intersection.
2. Classify depth-1 nodes as context groups by default.
3. If a depth-1 node matches an INE comarca, update that official comarca; otherwise persist it as a derived Idealista context/comarca row with a stable negative ID derived from `shortUri`.
4. Match depth-2 nodes to INE municipalities with stricter exact-first matching.
5. If a depth-2 branch cannot safely match an INE municipality, treat it as submunicipal under an inferred/containing municipality where possible.
6. If a depth-2 leaf cannot safely match an INE municipality, treat it as a neighborhood under a derived district when its parent context can be anchored.
7. Preserve every Spanish Idealista region in one of the geo tables where possible; skipped regions should be limited to the 254 regions under the four non-Spain roots, plus any explicitly audited anomalies.
