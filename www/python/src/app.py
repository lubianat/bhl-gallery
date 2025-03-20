import json
import re
import requests
from flask import Flask, render_template, jsonify, request

app = Flask(__name__)

# Load static JSON files at startup
with open("static/gbif_mapping.json") as f:
    gbif_mapping = json.load(f)

with open("static/continent_to_country_codes.json") as f:
    continent_to_country_codes = json.load(f)

with open("static/continent_keywords.json") as f:
    continent_keywords = json.load(f)

# Load image data from a static file (depicts_from_commons.json)
with open("static/depicts_from_commons.json") as f:
    depicts_from_commons = json.load(f)


def is_in_continent(species_id, continent):
    """
    Checks if a species (as defined in gbif_mapping) is present within a specified continent.
    Recursiveness has been removed for performance.
    """
    if not continent:
        return True  # No continent filter applied

    species_data = gbif_mapping.get(species_id)
    if not species_data:
        return False

    # Check by country codes
    continent_country_codes = continent_to_country_codes.get(continent, [])
    if any(
        code in continent_country_codes
        for code in species_data.get("country_codes", [])
    ):
        return True

    # Check by locality keywords
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
    Endpoint to return all images loaded from the static depicts_from_commons.json file.
    """
    try:
        # Assuming depicts_from_commons has a similar structure to the previous QLever response.
        images = depicts_from_commons
    except Exception as e:
        return jsonify({"error": str(e)}), 500
    return jsonify(images)


@app.route("/api/filter_images")
def filter_images():
    """
    Endpoint to filter images based on provided taxonKey and continent.
    Query parameters:
      - taxonKey: the selected taxon (or 'ALL' for no taxon filter)
      - continent: the selected continent code
    """
    taxon_key = request.args.get("taxonKey")
    continent = request.args.get("continent")

    try:
        images = depicts_from_commons
    except Exception as e:
        return jsonify({"error": str(e)}), 500

    filtered_images = []
    for item in images:
        # Ensure we have a proper species id (using the gbif_id field)
        species_id = str(item.get("gbif_id", ""))
        # If a taxonKey is provided and is not "ALL", check if the species has that taxon as a parent.
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


@app.route("/api/wikidata_langs")
def wikidata_langs():
    """
    On-demand endpoint to fetch language information from Wikidata for a given list of QIDs.
    The client should send a GET parameter 'qids' containing a comma-separated list of QIDs.
    Only QIDs matching the pattern Q[digits] are accepted.
    """
    qids_str = request.args.get("qids", "")
    # Split by comma and strip whitespace
    qids = [qid.strip() for qid in qids_str.split(",") if qid.strip()]
    # Validate each QID (must start with 'Q' followed by numbers)
    pattern = re.compile(r"^Q\d+$")
    valid_qids = []
    for qid in qids:
        if pattern.match(qid):
            valid_qids.append("wd:" + qid)
    if not valid_qids:
        return jsonify({"error": "No valid QIDs provided."}), 400

    # Build the VALUES clause from the valid QIDs
    values_clause = " ".join(valid_qids)
    sparql_query = f"""
    PREFIX schema: <http://schema.org/>
    PREFIX wd: <http://www.wikidata.org/entity/>
    PREFIX wdt: <http://www.wikidata.org/prop/direct/>
    PREFIX wikibase: <http://wikiba.se/ontology#>
    SELECT ?taxon (GROUP_CONCAT(?lang; separator=",") AS ?langs)
    WHERE {{
      VALUES ?taxon {{ {values_clause} }}
      ?article schema:about ?taxon ;
               schema:inLanguage ?lang ;
               schema:isPartOf [ wikibase:wikiGroup "wikipedia" ].
      FILTER(?lang in ("en", "fr", "pt", "es"))
    }}
    GROUP BY ?taxon
    """

    url = "https://query.wikidata.org/sparql"
    headers = {"Accept": "application/sparql-results+json"}
    try:
        response = requests.get(
            url, params={"query": sparql_query}, headers=headers, timeout=10
        )
        response.raise_for_status()
        data = response.json()
    except Exception as e:
        return jsonify({"error": str(e)}), 500

    # Process and reformat the results:
    results = {}
    for binding in data.get("results", {}).get("bindings", []):
        taxon_url = binding.get("taxon", {}).get("value", "")
        if taxon_url:
            qid = taxon_url.split("/")[-1]
            langs_str = binding.get("langs", {}).get("value", "")
            # Convert the comma-separated string to a list if not empty
            results[qid] = langs_str.split(",") if langs_str else []
    return jsonify(results)


if __name__ == "__main__":
    app.run(debug=True)
