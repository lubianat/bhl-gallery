import requests
import json
import time
import asyncio
import aiohttp
from tqdm import tqdm
from pathlib import Path

# QLEVER query URL (from your HTML)
QLEVER_URL = (
    "https://qlever.cs.uni-freiburg.de/api/wikimedia-commons?query="
    "PREFIX+schema%3A+%3Chttp%3A%2F%2Fschema.org%2F%3E%0A"
    "PREFIX+wd%3A+%3Chttp%3A%2F%2Fwww.wikidata.org%2Fentity%2F%3E%0A"
    "PREFIX+wdt%3A+%3Chttp%3A%2F%2Fwww.wikidata.org%2Fprop%2Fdirect%2F%3E%0A"
    "PREFIX+wikibase%3A+%3Chttp%3A%2F%2Fwikiba.se%2Fontology%23%3E%0A"
    "SELECT+DISTINCT+%3Ffile+%3Ftaxon+%3Fbhl_page_id+%3Furl+%3Fgbif_id+%3Ftaxon_name+"
    "%28GROUP_CONCAT%28%3Flang%3B+SEPARATOR%3D%22%2C%22%29+AS+%3Flangs%29%0A"
    "WHERE+%7B+%0A++%3Ffile+wdt%3AP180+%3Ftaxon+.%0A++%3Ffile+wdt%3AP687+%3Fbhl_page_id+.%0A"
    "++%3Ffile+schema%3AcontentUrl+%3Furl+.%0A++SERVICE+%3Chttps%3A%2F%2Fqlever.cs.uni-freiburg.de%2Fapi%2Fwikidata%3E+%7B%0A"
    "++++%3Ftaxon+wdt%3AP846+%3Fgbif_id+.%0A++++%3Ftaxon+wdt%3AP225+%3Ftaxon_name+.%0A"
    "++++%3Farticle+schema%3Aabout+%3Ftaxon+.+%0A++++%3Farticle+schema%3AinLanguage+%3Flang+%3B%0A"
    "++++schema%3AisPartOf+%5B+wikibase%3AwikiGroup+%22wikipedia%22+%5D+.%0A"
    "++++FILTER%28%3Flang+in+%28%27en%27%2C+%27fr%27%2C+%27pt%27%2C+%27es%27%29%29+.%0A++%7D%0A%7D%0A"
    "GROUP+BY+%3Ffile+%3Ftaxon+%3Fbhl_page_id+%3Furl+%3Fgbif_id+%3Ftaxon_name"
)

HERE = Path(__file__).parent


def fetch_qlever_data():
    """Fetch data from the QLEVER API."""
    print("Fetching QLEVER data...")
    response = requests.get(QLEVER_URL)
    response.raise_for_status()
    data = response.json()
    # The expected structure is: { "results": { "bindings": [ ... ] } }
    return data.get("results", {}).get("bindings", [])


async def fetch_json(session, url):
    async with session.get(url) as response:
        response.raise_for_status()
        return await response.json()


async def get_gbif_data(gbif_id, data, session):
    if gbif_id in data:
        return data
    else:
        data[gbif_id] = {}
    # --- Fetch Distributions ---
    distributions_url = (
        f"https://api.gbif.org/v1/species/{gbif_id}/distributions?limit=1000"
    )
    try:
        distributions_data = await fetch_json(session, distributions_url)
        distribution_localities = []
        country_codes = []
        for result in distributions_data.get("results", []):
            locality = result.get("locality")
            if locality:
                distribution_localities.append(locality)
            country = result.get("country")
            if country:
                country_codes.append(country)
        # Store unique values
        data[gbif_id]["localities"] = list(set(distribution_localities))
        data[gbif_id]["country_codes"] = list(set(country_codes))
    except Exception as e:
        print(f"Error fetching distributions for GBIF id {gbif_id}: {e}")

    # --- Fetch Parents ---
    parents_url = f"https://api.gbif.org/v1/species/{gbif_id}/parents"
    try:
        parents_data = await fetch_json(session, parents_url)
        parent_keys = [
            parent.get("key") for parent in parents_data if parent.get("key")
        ]
        data[gbif_id]["parents"] = parent_keys
    except Exception as e:
        print(f"Error fetching parents for GBIF id {gbif_id}: {e}")

    return data


async def main():
    # Fetch records from QLEVER
    records = fetch_qlever_data()
    print(f"Fetched {len(records)} records.")

    # Save the original QLEVER data to a JSON file (for reference or other use)
    with open("qlever_data.json", "w", encoding="utf-8") as f:
        json.dump(records, f, ensure_ascii=False, indent=2)
    print("Original QLEVER data saved to 'qlever_data.json'.")

    gbif_mappings = json.loads(HERE.joinpath("gbif_mapping.json").read_text())
    gbif_ids = [record.get("gbif_id", {}).get("value") for record in records]

    async with aiohttp.ClientSession() as session:
        tasks = []
        for idx, gbif_id in enumerate(tqdm(set(gbif_ids))):
            if gbif_id:
                tasks.append(get_gbif_data(gbif_id, gbif_mappings, session))

            # Optionally save progress every 10 records.
            if idx % 10 == 9:
                await asyncio.gather(*tasks)
                tasks = []
                with open("gbif_mapping.json", "w", encoding="utf-8") as f:
                    json.dump(gbif_mappings, f, ensure_ascii=False, indent=2)
                print(f"Progress saved after {idx + 1} records.")

        # Ensure all remaining tasks are completed
        if tasks:
            await asyncio.gather(*tasks)

    with open("gbif_mapping.json", "w", encoding="utf-8") as f:
        json.dump(gbif_mappings, f, ensure_ascii=False, indent=2)
    print("Final GBIF mapping saved to 'gbif_mapping.json'.")


if __name__ == "__main__":
    asyncio.run(main())
