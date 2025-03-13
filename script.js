document.getElementById('taxonAutocomplete').addEventListener('input', function () {
    const query = this.value;
    if (query.length < 3) {
        document.getElementById('autocompleteSuggestions').innerHTML = '';
        return;
    }

    const ranks = ['PHYLUM', 'CLASS', 'ORDER', 'FAMILY', 'GENUS', 'SPECIES'];
    const fetchPromises = ranks.map(rank => fetch(`https://api.gbif.org/v1/species/suggest?q=${query}&rank=${rank}&status=ACCEPTED`).then(response => response.json()));

    Promise.all(fetchPromises)
        .then(results => {
            const combinedData = results.flat();
            const suggestions = combinedData.map(item => `<div class="autocomplete-suggestion" data-key="${item.key}">${item.scientificName}</div>`).join('');
            document.getElementById('autocompleteSuggestions').innerHTML = suggestions;
        })
        .catch(error => {
            console.error('Error fetching suggestions:', error);
        });
});

document.getElementById('autocompleteSuggestions').addEventListener('click', function (event) {
    if (event.target.classList.contains('autocomplete-suggestion')) {
        const taxonKey = event.target.getAttribute('data-key');
        const taxonName = event.target.textContent;
        document.getElementById('taxonSelect').innerHTML += `<option value="${taxonKey}" selected>${taxonName}</option>`;
        document.getElementById('autocompleteSuggestions').innerHTML = '';
        document.getElementById('taxonAutocomplete').value = '';
    }
});
// Load static GBIF mapping data from JSON file
let gbifMapping = {};

fetch('gbif_mapping.json')
    .then(response => response.json())
    .then(data => {
        gbifMapping = data;
        console.log(gbifMapping);
        // Call function to render gallery after loading GBIF mapping
        fetchImages();
    })
    .catch(error => {
        console.error('Error loading GBIF mapping data:', error);
    });

// Continent to country code mapping (LLM-generated, may have errors)
let continentToCountryCodes = {};

fetch('continent_to_country_codes.json')
    .then(response => response.json())
    .then(data => {
        continentToCountryCodes = data;
        console.log(continentToCountryCodes);
    })
    .catch(error => {
        console.error('Error loading continent to country codes data:', error);
    });

let continentKeywords = {};

fetch('continent_keywords.json')
    .then(response => response.json())
    .then(data => {
        continentKeywords = data;
        console.log(continentKeywords);
    })
    .catch(error => {
        console.error('Error loading continent keywords data:', error);
    });

// Placeholder for image data
let imagesData = [];

// Lazy loading using IntersectionObserver
const observer = new IntersectionObserver((entries, obs) => {
    entries.forEach(entry => {
        if (entry.isIntersecting) {
            const img = entry.target;
            const actualSrc = img.getAttribute("data-src");
            if (actualSrc) {
                img.src = actualSrc;
                img.removeAttribute("data-src");
            }
            obs.unobserve(img);
        }
    });
}, {
    rootMargin: "0px 0px 200px 0px"
});

// Check if a species is in a particular continent based on country codes and locality text
function isInContinent(speciesId, continent) {
    if (!continent || continent === "") return true; // No continent filter

    const speciesData = gbifMapping[speciesId];
    if (!speciesData) return false;

    // Check parent taxonomy
    const relevantTaxonIds = Object.keys(gbifMapping)
        .filter(id => {
            return gbifMapping[id].parents &&
                gbifMapping[id].parents.some(p => p.toString() === speciesId);
        });

    if (relevantTaxonIds.length > 0) {
        for (const taxonId of relevantTaxonIds) {
            if (isInContinent(taxonId, continent)) return true;
        }
    }

    // Check country codes
    const continentCountryCodes = continentToCountryCodes[continent] || [];
    if (speciesData.country_codes.some(code => continentCountryCodes.includes(code))) {
        return true;
    }

    // Check locality text
    const continentKeywordList = continentKeywords[continent] || [];
    if (speciesData.localities.some(loc => {
        const locLower = loc.toLowerCase();
        return continentKeywordList.some(keyword => locLower.includes(keyword.toLowerCase()));
    })) {
        return true;
    }

    return false;
}


// Filter based on taxon and geography using GBIF API (occurrence data)
async function applyTaxonFilter(taxonKey) {
    function buildGbifUrl(taxonKey, continent) {
        let url = `https://api.gbif.org/v1/occurrence/search?taxonKey=${taxonKey}&limit=0&facet=speciesKey&facetMincount=10&facetLimit=5000`;
        if (continent && continent !== "") {
            url += `&continent=${encodeURIComponent(continent)}`;
        }
        return url;
    }
    let gbifUrl = buildGbifUrl(taxonKey, document.getElementById("continentSelect").value);

    console.log(gbifUrl);

    try {
        const response = await fetch(gbifUrl);
        if (!response.ok) throw new Error(`GBIF API error! status: ${response.status}`);
        const gbifData = await response.json();
        if (!gbifData.facets || gbifData.facets.length === 0) {
            alert("No facets found for the selected taxon.");
            return;
        }
        const facetCounts = gbifData.facets[0].counts;
        if (!facetCounts || facetCounts.length === 0) {
            alert("No species found meeting the criteria.");
            return;
        }
        const validKeys = new Set(facetCounts.map(item => String(item.name)));
        const filteredData = imagesData.filter(item => item.gbif_id && validKeys.has(String(item.gbif_id.value)));
        renderGallery(filteredData);
    } catch (error) {
        console.error("Error fetching GBIF data:", error);
        alert("Error applying taxon filter.");
    } finally {
        // Hide loading message when done
        document.getElementById("loading").style.display = "none";
        document.getElementById('gallery').classList.remove('hidden');
    }
}

// Filter based on taxon and geography using local JSON (distribution data)
function applyFilters(taxonKey, continent) {
    document.getElementById("loading").style.display = "block";

    try {
        // First get all species that have the taxon in their parents
        const speciesInTaxon = Object.keys(gbifMapping).filter(speciesId => {
            return gbifMapping[speciesId].parents &&
                gbifMapping[speciesId].parents.includes(parseInt(taxonKey));
        });

        // Then filter by continent if specified
        const validKeys = new Set(
            continent && continent !== ""
                ? speciesInTaxon.filter(speciesId => isInContinent(speciesId, continent))
                : speciesInTaxon
        );

        // Filter image data
        const filteredData = imagesData.filter(item => {
            return item.gbif_id && validKeys.has(String(item.gbif_id.value));
        });

        renderGallery(filteredData);
    } catch (error) {
        console.error("Error applying filters:", error);
        alert("Error applying filters.");
    } finally {
        document.getElementById("loading").style.display = "none";
        document.getElementById('gallery').classList.remove('hidden');
    }
}
function getUrlParams() {
    const params = new URLSearchParams(window.location.search);
    return {
        taxonKey: params.get('taxon') || '',
        continent: params.get('continent') || '',
        dataSource: params.get('dataSource') || 'json'
    };
}

// Populate form fields with URL parameters
function populateFormFields() {
    const { taxonKey, continent, dataSource } = getUrlParams();
    document.getElementById('taxonSelect').value = taxonKey;
    document.getElementById('continentSelect').value = continent;
    document.querySelector(`input[name="dataSource"][value="${dataSource}"]`).checked = true;
}

// Call the function to populate form fields on page load
window.onload = populateFormFields;
// Form handlers
document.getElementById("filterForm").addEventListener("submit", function (e) {
    e.preventDefault();
    document.getElementById("loading").style.display = "block";
    document.getElementById('gallery').classList.add('hidden');

    const taxonKey = document.getElementById("taxonSelect").value;
    const continent = document.getElementById("continentSelect").value;
    const dataSource = document.querySelector('input[name="dataSource"]:checked').value;

    // if (!taxonKey) {
    //     alert("Please select a valid taxon from the options.");
    //     document.getElementById("loading").style.display = "none";
    //     return;
    // }

    const url = `?taxon=${taxonKey}&continent=${continent}&dataSource=${dataSource}`;
    window.history.pushState({}, '', url);


    if (dataSource === "occurrence-api") {
        applyTaxonFilter(taxonKey);
    } else {
        applyFilters(taxonKey, continent);
    }
});
document.getElementById("resetFilter").addEventListener("click", function () {
    renderGallery(imagesData);
});

// URL to fetch image data from Qlever API
const qleverURL = "https://qlever.cs.uni-freiburg.de/api/wikimedia-commons?query=PREFIX+schema%3A+%3Chttp%3A%2F%2Fschema.org%2F%3E%0APREFIX+wd%3A+%3Chttp%3A%2F%2Fwww.wikidata.org%2Fentity%2F%3E%0APREFIX+wdt%3A+%3Chttp%3A%2F%2Fwww.wikidata.org%2Fprop%2Fdirect%2F%3E%0APREFIX+wikibase%3A+%3Chttp%3A%2F%2Fwikiba.se%2Fontology%23%3E%0ASELECT+DISTINCT+%3Ffile+%3Ftaxon+%3Fbhl_page_id+%3Furl+%3Fgbif_id+%3Ftaxon_name+%28GROUP_CONCAT%28%3Flang%3B+SEPARATOR%3D%22%2C%22%29+AS+%3Flangs%29%0AWHERE+%7B+%0A++%3Ffile+wdt%3AP180+%3Ftaxon+.%0A++%3Ffile+wdt%3AP687+%3Fbhl_page_id+.%0A++%3Ffile+schema%3AcontentUrl+%3Furl+.%0A++SERVICE+%3Chttps%3A%2F%2Fqlever.cs.uni-freiburg.de%2Fapi%2Fwikidata%3E+%7B%0A++++%3Ftaxon+wdt%3AP846+%3Fgbif_id+.%0A++++%3Ftaxon+wdt%3AP225+%3Ftaxon_name+.%0A++++%3Farticle+schema%3Aabout+%3Ftaxon+.+%0A++++%3Farticle+schema%3AinLanguage+%3Flang+%3B%0A++++schema%3AisPartOf+%5B+wikibase%3AwikiGroup+%22wikipedia%22+%5D+.%0A++++FILTER%28%3Flang+in+%28%27en%27%2C+%27fr%27%2C+%27pt%27%2C+%27es%27%29%29+.%0A++%7D%0A%7D%0AGROUP+BY+%3Ffile+%3Ftaxon+%3Fbhl_page_id+%3Furl+%3Fgbif_id+%3Ftaxon_name"

// Placeholder 1x1 pixel transparent image
const placeholder = "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==";

// Render gallery using data.results.bindings and extracting .value for each field
function renderGallery(data) {
    const gallery = document.getElementById("gallery");
    gallery.innerHTML = "";
    if (!data.length) {
        gallery.innerHTML = "<p>No images available.</p>";
        return;
    }
    data.forEach(item => {
        // Each item is an object where fields (url, taxon, etc.) have a .value property
        const imageURL = item.url ? item.url.value : "";
        const taxon_name = item.taxon_name ? item.taxon_name.value : "Image";
        const gbif_id = item.gbif_id ? item.gbif_id.value : "Unknown";
        const bhl_page_id = item.bhl_page_id ? item.bhl_page_id.value : "Unknown";
        const wikidata_id = item.taxon ? item.taxon.value : "";
        const commons_entity_id = item.file ? item.file.value : "";
        const langs = item.langs ? item.langs.value.split(",") : [];

        let gbif_url = "https://www.gbif.org/species/" + encodeURIComponent(gbif_id);
        let bhl_url = "https://www.biodiversitylibrary.org/page/" + encodeURIComponent(bhl_page_id);
        let wikidata_url = wikidata_id;
        let commons_url = commons_entity_id;

        const div = document.createElement("div");
        div.className = "gallery-item";

        const img = document.createElement("img");
        // Set placeholder as src and store actual image URL in data-src
        img.src = placeholder;
        img.setAttribute("data-src", imageURL);
        img.alt = taxon_name;

        const legend = document.createElement("div");
        legend.className = "image-legend";

        const taxonNameP = document.createElement("p");
        taxonNameP.textContent = taxon_name;

        const linksP = document.createElement("p");
        const gbifLink = document.createElement("a");
        gbifLink.href = gbif_url;
        gbifLink.target = "_blank";
        gbifLink.textContent = "GBIF";

        const bhlLink = document.createElement("a");
        bhlLink.href = bhl_url;
        bhlLink.target = "_blank";
        bhlLink.textContent = "BHL";

        const commonsLink = document.createElement("a");
        commonsLink.href = commons_url;
        commonsLink.target = "_blank";
        commonsLink.textContent = "Commons";

        const wikidataLink = document.createElement("a");
        wikidataLink.href = wikidata_url;
        wikidataLink.target = "_blank";
        wikidataLink.textContent = "Wikidata";

        linksP.appendChild(gbifLink);
        linksP.appendChild(document.createTextNode(" | "));
        linksP.appendChild(bhlLink);
        linksP.appendChild(document.createTextNode(" | "));
        linksP.appendChild(commonsLink);
        linksP.appendChild(document.createTextNode(" | "));
        linksP.appendChild(wikidataLink);

        const wikipediaLinksP = document.createElement("p");
        wikipediaLinksP.textContent = "Wikipedia links: ";
        const all_langs = ["en", "pt", "fr", "es"]
        all_langs.forEach(lang => {
            const wikiLink = document.createElement("a");
            const wikiUrl = `https://${lang}.wikipedia.org/wiki/${encodeURIComponent(taxon_name)}`;
            wikiLink.href = wikiUrl;
            wikiLink.target = "_blank";
            wikiLink.textContent = lang.toUpperCase();
            if (langs.includes(lang)) {
                wikiLink.className = "wiki-link-blue";
            } else {
                wikiLink.className = "wiki-link-red";
            }
            wikipediaLinksP.appendChild(wikiLink);
            wikipediaLinksP.appendChild(document.createTextNode(" | "));
        });
        // Remove the last " | "
        wikipediaLinksP.removeChild(wikipediaLinksP.lastChild);

        legend.appendChild(taxonNameP);
        legend.appendChild(linksP);
        legend.appendChild(wikipediaLinksP);

        div.appendChild(img);
        div.appendChild(legend);
        gallery.appendChild(div);
        observer.observe(img);
    });
}

// Fetch images from Qlever API and handle SPARQL response structure
async function fetchImages() {
    try {
        const response = await fetch(qleverURL);
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        const data = await response.json();
        // Expecting structure: { head: { vars: [...] }, results: { bindings: [...] } }
        if (data.results && Array.isArray(data.results.bindings)) {
            imagesData = data.results.bindings;
        } else {
            console.error("Unexpected API response structure", data);
            imagesData = [];
        }
        renderGallery(imagesData);
    } catch (error) {
        console.error("Error fetching images:", error);
        document.getElementById("gallery").innerHTML = "<p>Error loading images.</p>";
    } finally {
        document.getElementById("loading").style.display = "none";
        document.getElementById('gallery').classList.remove('hidden');
    }
}

// Start fetching images
fetchImages();
