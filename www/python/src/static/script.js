// --- Wikidata-based Autocomplete with P846, retrieving P225 (taxon name) and P846 (GBIF id) ---
document.getElementById('wikidataAutocomplete').addEventListener('input', function () {
    const query = this.value.trim();
    const suggestionsContainer = document.getElementById('wikidataAutocompleteSuggestions');

    if (query.length < 3) {
        suggestionsContainer.innerHTML = '';
        return;
    }

    // First call: search for entities with the given query and with a P846 statement
    const wikidataSearchUrl = `https://www.wikidata.org/w/api.php?action=query&format=json&list=search&formatversion=2&srsearch=${encodeURIComponent(`haswbstatement:"P846" ${query}`)}&origin=*`;

    fetch(wikidataSearchUrl)
        .then(response => response.json())
        .then(searchData => {
            // search is inside query 
            searchData = searchData.query;
            if (!searchData.search || searchData.search.length === 0) {
                suggestionsContainer.innerHTML = '<div class="autocomplete-suggestion">No results found</div>';
                return;
            }

            console.log(searchData);

            // Extract QIDs from the search results
            const qids = searchData.search.map(item => item.title).join('|');
            console.log(qids);

            // Second call: get detailed entity data for these QIDs (specifically, claims)
            const wikidataDetailsUrl = `https://www.wikidata.org/w/api.php?action=wbgetentities&ids=${qids}&props=claims&format=json&origin=*`;

            fetch(wikidataDetailsUrl)
                .then(response => response.json())
                .then(detailsData => {
                    console.log(detailsData);
                    // Build suggestions using P225 and P846 from the entity claims
                    const suggestionsHtml = searchData.search.map(item => {
                        const qid = item.title;
                        // Look up the entity details if available
                        if (detailsData.entities && detailsData.entities[qid] && detailsData.entities[qid].claims) {
                            const claims = detailsData.entities[qid].claims;
                            if (claims.P225 && claims.P225.length > 0) {
                                taxonName = claims.P225[0].mainsnak.datavalue.value;
                            }
                            if (claims.P846 && claims.P846.length > 0) {
                                gbifId = claims.P846[0].mainsnak.datavalue.value;
                            }
                        }

                        // Use the retrieved taxonName if available; fallback to the search result label
                        const displayName = taxonName || item.label;
                        // Optionally display GBIF id if available
                        const displayGbif = gbifId ? ` (GBIF: ${gbifId})` : '';

                        return `<div class="autocomplete-suggestion" data-qid="${qid}" data-label="${displayName}" data-gbif="${gbifId}">
                        ${displayName}${displayGbif}
                      </div>`;
                    }).join('');
                    suggestionsContainer.innerHTML = suggestionsHtml;
                })
                .catch(error => {
                    console.error('Error fetching details from wbgetentities:', error);
                    suggestionsContainer.innerHTML = '<div class="autocomplete-suggestion">Error fetching details</div>';
                });
        })
        .catch(error => {
            console.error('Error fetching Wikidata search suggestions:', error);
            suggestionsContainer.innerHTML = '<div class="autocomplete-suggestion">Error fetching suggestions</div>';
        });
});

// --- Handling click on Wikidata autocomplete suggestions ---
document.getElementById('wikidataAutocompleteSuggestions').addEventListener('click', function (event) {
    if (event.target.classList.contains('autocomplete-suggestion')) {
        const qid = event.target.getAttribute('data-qid');
        const label = event.target.getAttribute('data-label');
        const gbif = event.target.getAttribute('data-gbif'); // optional GBIF id

        // Update the taxon select element with the selected value
        const select = document.getElementById('taxonSelect');
        let optionExists = false;
        for (let i = 0; i < select.options.length; i++) {
            if (select.options[i].value === qid) {
                optionExists = true;
                break;
            }
        }
        if (!optionExists) {
            // Display the scientific name and, if available, the GBIF id in the option text
            const displayText = gbif ? `${label} (GBIF: ${gbif})` : label;
            select.innerHTML += `<option value="${gbif}" selected>${displayText}</option>`;
        } else {
            select.value = qid;
        }

        // Clear the autocomplete input and suggestion container
        document.getElementById('wikidataAutocomplete').value = '';
        document.getElementById('wikidataAutocompleteSuggestions').innerHTML = '';

        // Set the gallery and imageCounter to hidden, so the user is aware he needs to submit the form
        document.getElementById('gallery').classList.add('hidden');
        document.getElementById('imageCounter').classList.add('hidden');
        // Optionally trigger the filtering immediately
        //document.getElementById('filterForm').dispatchEvent(new Event('submit'));
    }
});


// --- Global variables and lazy loading setup ---
let originalImagesData = [];
let imagesData = [];
let currentPage = 0;
const pageSize = 10; // Adjust as needed
const placeholder = "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==";

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
    rootMargin: "0px 0px 10px 0px",
    threshold: 0.5
});

function updateGlobalUsesForBatch(imagesBatch) {
    const fileNames = imagesBatch.map(item => item.url).filter(name => name);
    fileNames.forEach((url, index) => {
        const parts = url.split("/");
        fileNames[index] = parts[parts.length - 1];
    });
    const uniqueFileNames = [...new Set(fileNames)];
    if (!uniqueFileNames.length) return;
    const filesParam = uniqueFileNames.join("|");

    fetch(`/api/global_uses/${encodeURIComponent(filesParam)}`)
        .then(response => response.json())
        .then(data => {
            // Data is an object mapping each file name to its global usage info.
            // Now update each gallery item that was rendered.
            document.querySelectorAll('.gallery-item').forEach(itemElem => {
                const fileName = itemElem.querySelector('img').getAttribute('data-file');
                if (!fileName) return; // Skip if fileName is null
                if (fileName && data[fileName]) {
                    const globalUsageP = itemElem.querySelector('.global-usage');
                    if (globalUsageP) {
                        // Update the content to make only the link clickable
                        globalUsageP.textContent = "Global Usage: "; // Reset and add static text
                        const usageLink = document.createElement("a");
                        usageLink.href = `https://commons.wikimedia.org/wiki/File:${encodeURIComponent(fileName)}#filelinks`;
                        usageLink.target = "_blank";
                        usageLink.textContent = `${data[fileName].length}`;
                        console.log(data[fileName]);
                        // Add tooltip with full data get all [].wiki values split by \n
                        const tooltipData = data[fileName].map(item => item.wiki).join("\n");
                        usageLink.title = tooltipData;

                        globalUsageP.appendChild(usageLink);
                    }
                }
            });

        })
        .catch(err => console.error("Error fetching global usage data:", err));
}

// --- Helper: Update language information for a batch of images ---
function updateLangInfoForBatch(imagesBatch) {
    // Extract unique QIDs from the batch.
    const qids = imagesBatch.map(item => {
        // Assuming item.taxon.value is something like "http://www.wikidata.org/entity/Q12345"
        const url = item.taxon;
        return url.split("/").pop();
    });
    const uniqueQIDs = [...new Set(qids)];
    if (!uniqueQIDs.length) return;

    // Construct the query parameter.
    const qidsParam = uniqueQIDs.join(",");
    fetch(`/api/wikidata_langs?qids=${encodeURIComponent(qidsParam)}`)
        .then(response => response.json())
        .then(data => {
            // Data is an object mapping QIDs to a list of languages.
            // Now, update each gallery item that was rendered.
            // For this, we assume each gallery item container has a data attribute 'data-qid'
            document.querySelectorAll('.gallery-item').forEach(itemElem => {
                const qid = itemElem.getAttribute('data-qid');
                if (qid && data[qid]) {
                    // Find the element that holds the Wikipedia links.
                    const wikiLinksP = itemElem.querySelector('.wikipedia-links');
                    if (wikiLinksP) {
                        // Clear existing links.
                        wikiLinksP.innerHTML = "Wikipedia links: ";
                        // Create new links based on the live language data.
                        let langs = data[qid];
                        const all_langs = ["en", "pt", "fr", "es"];
                        all_langs.forEach(lang => {
                            const wikiLink = document.createElement("a");
                            const wikiUrl = `https://${lang}.wikipedia.org/wiki/${encodeURIComponent(itemElem.getAttribute('data-taxon'))}`;
                            wikiLink.href = wikiUrl;
                            wikiLink.target = "_blank";
                            wikiLink.textContent = lang.toUpperCase();
                            wikiLink.className = langs.includes(lang) ? "wiki-link-blue" : "wiki-link-red";
                            wikiLinksP.appendChild(wikiLink);
                            // Add link to https://inat2wiki.toolforge.org/wikistub/lang/qid only if language is missing 
                            // if (!langs.includes(lang)) {
                            //     const inat2wikiLink = document.createElement("a");
                            //     const inat2wikiUrl = `https://inat2wiki.toolforge.org/wikistub/${lang}/${qid}`;
                            //     inat2wikiLink.href = inat2wikiUrl;
                            //     inat2wikiLink.target = "_blank";
                            //     inat2wikiLink.innerHTML = "<sup>+</sup>";
                            //     wikiLinksP.appendChild(inat2wikiLink);
                            // }
                            wikiLinksP.appendChild(document.createTextNode(" | "));
                        });
                        // Remove the last separator.
                        if (wikiLinksP.lastChild) {
                            wikiLinksP.removeChild(wikiLinksP.lastChild);
                        }
                    }
                }
            });
        })
        .catch(err => console.error("Error fetching Wikidata langs:", err));
}

// --- Modified appendGalleryItems function ---
function appendGalleryItems(dataBatch) {
    const gallery = document.getElementById("gallery");
    dataBatch.forEach(item => {
        const imageURL = item.url ? item.url : "";
        const taxon_name = item.taxon_name ? item.taxon_name : "Image";
        const gbif_id = item.gbif_id ? item.gbif_id : "Unknown";
        const inat_id = item.inat_id ? item.inat_id : "Unknown";
        const bhl_page_id = item.bhl_page_id ? item.bhl_page_id : "Unknown";
        const wikidata_id = item.taxon ? item.taxon : "";
        const commons_entity_id = item.file ? item.file : "";
        // Languages are not provided by the static dataset

        let gbif_url = "https://www.gbif.org/species/" + encodeURIComponent(gbif_id);
        let bhl_url = "https://www.biodiversitylibrary.org/page/" + encodeURIComponent(bhl_page_id);
        let inat_url = "https://www.inaturalist.org/taxa/" + encodeURIComponent(inat_id);
        let wikidata_url = wikidata_id;
        let commons_url = commons_entity_id;

        const div = document.createElement("div");
        div.className = "gallery-item";
        // Save the taxon QID and name for later language update.
        const qid = wikidata_url.split("/").pop();
        div.setAttribute("data-qid", qid);
        div.setAttribute("data-taxon", taxon_name);

        const img = document.createElement("img");
        img.src = placeholder;
        img.setAttribute("data-src", imageURL);
        // Uncode the file name; it is URL encoded.
        const parts = imageURL.split("/");
        const file = parts[parts.length - 1];
        let fileUncoded = decodeURIComponent(file);
        fileUncoded = fileUncoded.replace(/_/g, " ");
        img.setAttribute("data-file", fileUncoded);
        img.alt = taxon_name;

        const legend = document.createElement("div");
        legend.className = "image-legend";

        const taxonNameP = document.createElement("p");
        taxonNameP.textContent = taxon_name;

        const linksP = document.createElement("p");
        const inatLink = document.createElement("a");
        inatLink.href = inat_url;
        inatLink.target = "_blank";
        inatLink.textContent = "iNat";

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

        linksP.appendChild(inatLink);
        linksP.appendChild(document.createTextNode(" | "));
        linksP.appendChild(gbifLink);
        linksP.appendChild(document.createTextNode(" | "));
        linksP.appendChild(bhlLink);
        linksP.appendChild(document.createTextNode(" | "));
        linksP.appendChild(commonsLink);
        linksP.appendChild(document.createTextNode(" | "));
        linksP.appendChild(wikidataLink);

        // Create an element for Wikipedia links that will be updated live.
        const wikipediaLinksP = document.createElement("p");
        wikipediaLinksP.className = "wikipedia-links";
        wikipediaLinksP.textContent = "Wikipedia links: (unable to fetch)";

        // Create an element for global usage that will be updated live.
        const globalUsageP = document.createElement("p");
        globalUsageP.className = "global-usage";
        globalUsageP.textContent = "Global Usage: (unable to fetch)";

        legend.appendChild(taxonNameP);
        legend.appendChild(linksP);
        legend.appendChild(wikipediaLinksP);
        legend.appendChild(globalUsageP);

        div.appendChild(img);
        div.appendChild(legend);
        gallery.appendChild(div);

        observer.observe(img);
    });

    // Once the batch is rendered, fetch and update language info.
    updateLangInfoForBatch(dataBatch);

    updateGlobalUsesForBatch(dataBatch);
}

function renderGalleryPaginated(data, reset = false) {

    document.getElementById("imageCount").textContent = data.length;
    document.getElementById("imageCounter").classList.remove("hidden");
    const gallery = document.getElementById("gallery");
    if (reset) {
        gallery.innerHTML = "";
        currentPage = 0;
    }
    const startIndex = currentPage * pageSize;
    const endIndex = startIndex + pageSize;
    const dataBatch = data.slice(startIndex, endIndex);
    appendGalleryItems(dataBatch);
    currentPage++;

    if (currentPage * pageSize < data.length) {
        addSentinel();
    }
}

function addSentinel() {
    let sentinel = document.getElementById("sentinel");
    if (sentinel) {
        sentinel.remove();
    }
    sentinel = document.createElement("div");
    sentinel.id = "sentinel";
    document.getElementById("gallery").appendChild(sentinel);
    sentinelObserver.observe(sentinel);
}

const sentinelObserver = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
        if (entry.isIntersecting) {
            renderGalleryPaginated(imagesData, false);
        }
    });
}, {
    rootMargin: "0px",
    threshold: 0.5
});

// --- Fetching Images ---
async function fetchImages() {
    try {
        const response = await fetch('/api/images');
        const data = await response.json();
        imagesData = data;
        originalImagesData = imagesData;
        renderGalleryPaginated(imagesData, true);
    } catch (error) {
        console.error("Error fetching images:", error);
        document.getElementById("gallery").innerHTML = "<p>Error loading images.</p>";
    } finally {
        document.getElementById("loading").style.display = "none";
        document.getElementById('gallery').classList.remove('hidden');
    }
}

// --- Fetch filtered images based on URL or form parameters ---
async function fetchFilteredImages(taxonKey, continent, dataSource) {
    let endpoint = '/api/filter_images';
    endpoint += `?taxonKey=${taxonKey || ''}&continent=${continent || ''}&dataSource=${dataSource}`;

    try {
        const response = await fetch(endpoint);
        const data = await response.json();
        imagesData = data;
        renderGalleryPaginated(imagesData, true);
    } catch (error) {
        console.error("Error applying filter:", error);
        alert("Error applying filter.");
    } finally {
        document.getElementById("loading").style.display = "none";
        document.getElementById('gallery').classList.remove('hidden');
    }
}


// --- URL Parameter Handling ---
// Update the URL without reloading the page.
function updateURLWithFilters(taxonKey, continent) {
    const params = new URLSearchParams();
    if (taxonKey) params.set("taxonKey", taxonKey);
    if (continent) params.set("continent", continent);
    const newUrl = window.location.pathname + "?" + params.toString();
    window.history.pushState({ path: newUrl }, '', newUrl);
}

// Check for filter parameters in the URL and apply them.
function applyFiltersFromURL() {
    const params = new URLSearchParams(window.location.search);
    const taxonKey = params.get('taxonKey');
    const continent = params.get('continent');

    if (taxonKey) {
        document.getElementById("taxonSelect").value = taxonKey;

    }
    if (continent) {
        document.getElementById("continentSelect").value = continent;
    }
    // If either parameter is present, trigger the filtered fetch.
    if (taxonKey || continent) {
        document.getElementById("loading").style.display = "block";
        document.getElementById('gallery').classList.add('hidden');
        fetchFilteredImages(taxonKey, continent);
    } else {
        // Otherwise, fetch all images.
        fetchImages();
    }
}

// --- Form Submission Handler ---
// Show warning if autocomplete has content but no selection
document.getElementById("filterForm").addEventListener("submit", async function (e) {
    const autocompleteInput = document.getElementById("wikidataAutocomplete");
    const autocompleteValue = autocompleteInput.value.trim();

    if (autocompleteValue.length > 0) {
        e.preventDefault();
        autocompleteInput.classList.add("is-invalid");
        return;
    }

    autocompleteInput.classList.remove("is-invalid");

    // Proceed as usual
    e.preventDefault();
    document.getElementById("loading").style.display = "block";
    document.getElementById('gallery').classList.add('hidden');
    document.getElementById('imageCounter').classList.add('hidden');

    const taxonKey = document.getElementById("taxonSelect").value;
    const continent = document.getElementById("continentSelect").value;
    const dataSource = document.querySelector('input[name="dataSource"]:checked').value;

    updateURLWithFilters(taxonKey, continent);
    fetchFilteredImages(taxonKey, continent, dataSource);
});




// Reset filter to show original images and update URL.
document.getElementById("resetFilter").addEventListener("click", function () {
    document.getElementById("taxonSelect").value = "";
    document.getElementById("continentSelect").value = "";
    updateURLWithFilters("", "");
    imagesData = originalImagesData;
    renderGalleryPaginated(imagesData, true);
});

// --- On page load, check for filter parameters ---
window.addEventListener("load", applyFiltersFromURL);
