## Explorer page

SSR explorer page
Dynamically lazy laoded rendered images

## Map zone page

Gmaps foundation

### Scroll

For every interaction, the server sends

- region outlines as webp, several for every region (fast render)
- png tiles for the map at the given zoom scale (slow render)
- polygon json (fast)

Fetches and renders regions, seemingly, according to polygon size/area rather than tree depth.
- Better yet, call and rerender the map based on regions displayed. If too few are displayed on the screen, fetch divisors for all on the screen
- Classify by size, not type.

### Mouse hover

#### Short

Probably renders a line along the polygon passed. Effectively increases the line width of the outline

#### Long

Hover info popup modal

- name
- business count

### Click

1. Centers screen to the region and fills the polygon with a color.
2. Selects the polygon as the cadidate region from which to fetch business entries
