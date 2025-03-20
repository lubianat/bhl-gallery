import requests
import json
import time
import asyncio
import aiohttp
from tqdm import tqdm
from pathlib import Path


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
    HERE = Path(__file__).resolve().parent
    records_path = HERE.joinpath("depicts_from_commons.json")
    records = json.loads(records_path.read_text())
    print(f"Fetched {len(records)} records.")

    gbif_mapping_path = HERE.joinpath("gbif_mapping.json")
    if gbif_mapping_path.exists():
        gbif_mappings = json.loads(gbif_mapping_path.read_text())
    else:
        gbif_mappings = {}
    gbif_ids = [record.get("gbif_id", "") for record in records]

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
