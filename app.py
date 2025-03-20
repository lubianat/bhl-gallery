import json
from flask import Flask, render_template, jsonify, request
import requests

app = Flask(__name__)

# Load static JSON files at startup
with open("static/gbif_mapping.json") as f:
    gbif_mapping = json.load(f)

with open("static/continent_to_country_codes.json") as f:
    continent_to_country_codes = json.load(f)

with open("static/continent_keywords.json") as f:
    continent_keywords = json.load(f)

# Define the QLever SPARQL query for fetching image data
QLEVER_QUERY = """
PREFIX schema: <http://schema.org/>
PREFIX wd: <http://www.wikidata.org/entity/>
PREFIX wdt: <http://www.wikidata.org/prop/direct/>
PREFIX wikibase: <http://wikiba.se/ontology#>
SELECT DISTINCT ?file ?taxon ?bhl_page_id ?url ?gbif_id ?taxon_name ?inat_id (GROUP_CONCAT(?lang; SEPARATOR=",") AS ?langs)
WHERE {
  ?file wdt:P180 ?taxon.
  ?file wdt:P687 ?bhl_page_id.
  ?file schema:contentUrl ?url.
  SERVICE <https://qlever.cs.uni-freiburg.de/api/wikidata> {
    ?taxon wdt:P846 ?gbif_id.
    ?taxon wdt:P225 ?taxon_name.
    OPTIONAL { ?taxon wdt:P3151 ?inat_id .}
    ?article schema:about ?taxon.
    ?article schema:inLanguage ?lang;
             schema:isPartOf [ wikibase:wikiGroup "wikipedia" ].
    FILTER(?lang in ('en', 'fr', 'pt', 'es')).
  }
}
GROUP BY ?file ?taxon ?bhl_page_id ?url ?gbif_id ?taxon_name ?inat_id
"""


def is_in_continent(species_id, continent):
    """
    Check if a species (from gbif_mapping) is found within a given continent.
    This function recurses over child taxa, then checks country codes and locality keywords.
    """
    if not continent:
        return True  # No continent filter applied

    species_data = gbif_mapping.get(species_id)
    if not species_data:
        return False

    # Check child taxa recursively
    for taxon_id, taxon_data in gbif_mapping.items():
        if "parents" in taxon_data and species_id in taxon_data["parents"]:
            if is_in_continent(taxon_id, continent):
                return True

    # Check country codes
    continent_country_codes = continent_to_country_codes.get(continent, [])
    if any(
        code in continent_country_codes
        for code in species_data.get("country_codes", [])
    ):
        return True

    # Check locality keywords
    continent_keyword_list = continent_keywords.get(continent, [])
    for loc in species_data.get("localities", []):
        if any(keyword.lower() in loc.lower() for keyword in continent_keyword_list):
            return True

    return False


@app.route("/")
def index():
    return render_template("index.html")


@app.route("/api/images")
def get_images():
    """
    Endpoint to fetch all images from the QLever API.
    """
    encoded_query = requests.utils.quote(QLEVER_QUERY)
    qlever_url = (
        f"https://qlever.cs.uni-freiburg.de/api/wikimedia-commons?query={encoded_query}"
    )
    try:
        response = requests.get(qlever_url)
        response.raise_for_status()
        data = response.json()
        images = data.get("results", {}).get("bindings", [])
    except Exception as e:
        return jsonify({"error": str(e)}), 500
    return jsonify(images)


@app.route("/api/filter_images")
def filter_images():
    """
    Endpoint to filter images based on taxon key and continent.
    Query parameters:
      - taxonKey: selected taxon (or 'ALL' for no taxon filter)
      - continent: selected continent code
    """
    taxon_key = request.args.get("taxonKey")
    continent = request.args.get("continent")

    # Fetch images from QLever
    encoded_query = requests.utils.quote(QLEVER_QUERY)
    qlever_url = (
        f"https://qlever.cs.uni-freiburg.de/api/wikimedia-commons?query={encoded_query}"
    )
    try:
        response = requests.get(qlever_url)
        response.raise_for_status()
        data = response.json()
        images = data.get("results", {}).get("bindings", [])
    except Exception as e:
        return jsonify({"error": str(e)}), 500

    filtered_images = []
    for item in images:
        species_id = str(item.get("gbif_id", {}).get("value"))
        # If a taxon key is provided and is not "ALL", verify the species has the taxon as a parent.
        if taxon_key and taxon_key != "ALL":
            parents = gbif_mapping.get(species_id, {}).get("parents")
            if not parents or int(taxon_key) not in parents:
                continue
        # Apply continent filtering if provided.
        if continent:
            if not is_in_continent(species_id, continent):
                continue
        filtered_images.append(item)

    return jsonify(filtered_images)


if __name__ == "__main__":
    app.run(debug=True)
