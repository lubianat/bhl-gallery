// --- Autocomplete logic remains unchanged ---
document.getElementById('taxonAutocomplete').addEventListener('input', function () {
    const query = this.value;
    if (query.length < 3) {
        document.getElementById('autocompleteSuggestions').innerHTML = '';
        return;
    }

    const ranks = ['PHYLUM', 'CLASS', 'ORDER', 'FAMILY', 'GENUS', 'SPECIES'];
    const fetchPromises = ranks.map(rank =>
        fetch(`https://api.gbif.org/v1/species/suggest?q=${query}&rank=${rank}&status=ACCEPTED`)
            .then(response => response.json())
    );

    Promise.all(fetchPromises)
        .then(results => {
            const combinedData = results.flat();
            const suggestions = combinedData.map(item =>
                `<div class="autocomplete-suggestion" data-key="${item.key}">${item.scientificName}</div>`
            ).join('');
            document.getElementById('autocompleteSuggestions').innerHTML = suggestions;
        })
        .catch(error => {
            document.getElementById("imageCounter").classList.add("hidden");
            console.error('Error fetching suggestions:', error);
        });
});

document.getElementById('autocompleteSuggestions').addEventListener('click', function (event) {
    if (event.target.classList.contains('autocomplete-suggestion')) {
        const taxonKey = event.target.getAttribute('data-key');
        const taxonName = event.target.textContent;
        const select = document.getElementById('taxonSelect');
        let optionExists = false;
        for (let i = 0; i < select.options.length; i++) {
            if (select.options[i].value === taxonKey) {
                optionExists = true;
                break;
            }
        }
        if (!optionExists) {
            select.innerHTML += `<option value="${taxonKey}" selected>${taxonName}</option>`;
        } else {
            select.value = taxonKey;
        }
        document.getElementById('autocompleteSuggestions').innerHTML = '';
        document.getElementById('taxonAutocomplete').value = '';
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
                        globalUsageP.textContent = "Global Usage: " + data[fileName].length;
                    }
                }
            }
            );

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
document.getElementById("filterForm").addEventListener("submit", async function (e) {
    e.preventDefault();
    document.getElementById("loading").style.display = "block";
    document.getElementById('gallery').classList.add('hidden');

    const taxonKey = document.getElementById("taxonSelect").value;
    const continent = document.getElementById("continentSelect").value;
    const dataSource = document.querySelector('input[name="dataSource"]:checked').value;

    updateURLWithFilters(taxonKey, continent);

    fetchFilteredImages(taxonKey, continent, dataSource);  // Pass the selected dataSource
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
