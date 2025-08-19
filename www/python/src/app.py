import json
import re
import requests
from flask import Flask, render_template, jsonify, request
from urllib.parse import quote, unquote

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


@app.route("/about")
def about():
    return render_template("about.html")


@app.route("/api/images")
def get_images():
    """
    Endpoint to return all images loaded from the static depicts_from_commons.json file.
    """
    try:
        images = depicts_from_commons
    except Exception as e:
        return jsonify({"error": str(e)}), 500
    return jsonify(images)


@app.route("/api/filter_images")
def filter_images():
    """
    Endpoint to filter images based on provided taxonKey, continent, and dataSource.
    Query parameters:
      - taxonKey: the selected taxon (or 'ALL' for no taxon filter)
      - continent: the selected continent code
      - dataSource: the selected data source (either 'species-api' or 'occurrence-api')
    """
    taxon_key = request.args.get("taxonKey")
    continent = request.args.get("continent")
    data_source = request.args.get("dataSource")
    if not data_source or data_source == "undefined":
        data_source = "species-api"

    try:
        images = depicts_from_commons
    except Exception as e:
        return jsonify({"error": str(e)}), 500

    filtered_images = []

    if data_source == "species-api":
        for item in images:
            species_id = str(item.get("gbif_id", ""))
            if taxon_key and taxon_key != "ALL":
                parents = gbif_mapping.get(species_id, {}).get("parents")
                is_taxon_key_in_parents = parents and int(taxon_key) in parents
                is_species_id_equal_to_taxon_key = int(species_id) == int(taxon_key)
                if not is_taxon_key_in_parents and not is_species_id_equal_to_taxon_key:
                    continue
            if continent:
                if not is_in_continent(species_id, continent):
                    continue
            filtered_images.append(item)

    elif data_source == "occurrence-api":

        def fetch_gbif_occurrence_data(taxon_key, continent):
            gbif_url = f"https://api.gbif.org/v1/occurrence/search?taxonKey={taxon_key}&limit=100&facet=speciesKey&facetMincount=10&facetLimit=5000"
            if continent:
                gbif_url += f"&continent={quote(continent)}"
            return requests.get(gbif_url).json()

        if taxon_key and taxon_key != "ALL":
            occurrence_data = fetch_gbif_occurrence_data(taxon_key, continent)
            if "facets" in occurrence_data:
                valid_species_keys = set(
                    [
                        str(facet["name"])
                        for facet in occurrence_data["facets"][0]["counts"]
                    ]
                )
                for item in images:
                    if str(item.get("gbif_id", "")) in valid_species_keys:
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
    qids = [qid.strip() for qid in qids_str.split(",") if qid.strip()]
    pattern = re.compile(r"^Q\d+$")
    valid_qids = []
    for qid in qids:
        if pattern.match(qid):
            valid_qids.append("wd:" + qid)
    if not valid_qids:
        return jsonify({"error": "No valid QIDs provided."}), 400

    union_blocks = []
    for q in valid_qids:
        block = f"""
        {{
            VALUES ?taxon {{ {q} }}
            ?article schema:about ?taxon ;
                     schema:inLanguage ?lang ;
                     schema:isPartOf [ wikibase:wikiGroup "wikipedia" ].
        }}
        """
        union_blocks.append(block)
    union_query_body = "\nUNION\n".join(union_blocks)

    sparql_query = f"""
    PREFIX schema: <http://schema.org/>
    PREFIX wd: <http://www.wikidata.org/entity/>
    PREFIX wdt: <http://www.wikidata.org/prop/direct/>
    PREFIX wikibase: <http://wikiba.se/ontology#>
    SELECT ?taxon (GROUP_CONCAT(?lang; separator=",") AS ?langs)
    WHERE {{
        {union_query_body}
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

    results = {}
    for qid in valid_qids:
        results[qid[3:]] = []
    for binding in data.get("results", {}).get("bindings", []):
        taxon_url = binding.get("taxon", {}).get("value", "")
        if taxon_url:
            qid = taxon_url.split("/")[-1]
            langs_str = binding.get("langs", {}).get("value", "")
            results[qid] = langs_str.split(",") if langs_str else []
    return jsonify(results)


@app.route("/api/global_uses/<files>")
def global_uses(files):
    """
    Accepts a tab-separated list of Commons file names.
    Calls the MediaWiki API (from Commons) to get global usage info for each file.
    Returns a JSON object mapping each file name to its global usage data.
    """
    file_names = files.split("|")
    if "File:" in file_names:
        file_names = [file_name.replace("File:", "") for file_name in file_names]
    titles = "|".join([f"File:{file_name}" for file_name in file_names])
    titles = unquote(titles)

    params = {
        "action": "query",
        "titles": titles,
        "prop": "globalusage",
        "format": "json",
        "gulimit": "max",
    }
    url = "https://commons.wikimedia.org/w/api.php"
    try:
        response = requests.get(url, params=params, timeout=10)
        response.raise_for_status()
        data = response.json()
    except Exception as e:
        return jsonify({"error": str(e)}), 500

    results = {}
    pages = data.get("query", {}).get("pages", {})
    for page_id, page_data in pages.items():
        title = page_data.get("title", "")
        file_name = title[5:] if title.startswith("File:") else title
        global_usage = page_data.get("globalusage", [])
        results[file_name] = global_usage
    return jsonify(results)


# New endpoint to fetch parent taxa from GBIF's Species API
@app.route("/api/parent_taxa/<taxon_key>")
def get_parent_taxa(taxon_key):
    """
    Endpoint to fetch parent taxa from GBIF's Species API.
    """
    try:
        url = f"https://api.gbif.org/v1/species/{taxon_key}/parents"
        response = requests.get(url, timeout=10)
        response.raise_for_status()
        parent_data = response.json()
    except Exception as e:
        return jsonify({"error": str(e)}), 500
    return jsonify(parent_data)


if __name__ == "__main__":
    app.run(debug=True)
