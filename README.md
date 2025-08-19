# About

This project explores images from the [Biodiversity Heritage Library (BHL)](https://www.biodiversitylibrary.org/),  
with support from [GBIF](https://www.gbif.org), [Wikidata](https://www.wikidata.org), and [Wikimedia Commons](https://commons.wikimedia.org).

The project enables filtering by taxa and location to find beautiful, freely licensed images (usually public domain).  

Its main userbase are Wikimedians who are interested in improving Wikipedia articles on biodiversity.  
In addition to the images, the site shows:

- A count of image usages across Wikipedias in all languages (and other projects like Wikidata).  
- Links to the taxon page in four Wikipedia editions: **English, Portuguese, Spanish, and French**.  

These languages were selected due to their relevance for African and South American countries, the initial focus of the work.

---

## Data sources

- Images come from **Wikimedia Commons**, uploaded there from the Biodiversity Heritage Library over the decades by volunteers and staff.  
- Image metadata was curated as **Structured Data on Commons**, combining volunteer work with a Wikimedian-in-Residence (Nov 2024 – May 2025).  
  See this [blog post about the work](https://blog.biodiversitylibrary.org/2025/07/seeds-for-future-closing-thoughts-from-bhls-wikimedian-in-residence.html).  
- A detailed explanation of the **BHL–Wikimedia partnership** is available on [MetaWiki](https://meta.wikimedia.org/wiki/User:GFontenelle_(WMF)/BHL).

---

## Integration with GBIF

The [GBIF species API](https://techdocs.gbif.org/en/openapi/v1/species#/Species/getNameUsageDistributions) and  
[occurrence API](https://techdocs.gbif.org/en/openapi/v1/occurrence) filters on the main page may return different results:

- **/species API**: relies on pre-run queries to enrich the dataset with GBIF information on where species occur,  
  using textual content and country-level data.  
- **/occurrence API**: returns fewer results and may take longer, as it runs live GBIF queries.  
  It is computationally intensive and not meant for comprehensive coverage, so some groups may have less coverage.  

GBIF also powers a Global Occurrence Map, which includes occurrences worldwide for the selected taxa.

---

