// Autocomplete event handlers for taxa search remain unchanged.
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
            console.error('Error fetching suggestions:', error);
        });
});

document.getElementById('autocompleteSuggestions').addEventListener('click', function (event) {
    if (event.target.classList.contains('autocomplete-suggestion')) {
        const taxonKey = event.target.getAttribute('data-key');
        const taxonName = event.target.textContent;
        const select = document.getElementById('taxonSelect');
        // Check if the option already exists.
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

// Global variables to store image data and pagination parameters.
let originalImagesData = [];
let imagesData = [];
let currentPage = 0;
const pageSize = 20; // Adjust as needed

// Placeholder 1x1 pixel transparent image for lazy loading.
const placeholder = "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==";

// IntersectionObserver for lazy loading individual images.
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

// Append a batch of gallery items to the DOM.
function appendGalleryItems(dataBatch) {
    const gallery = document.getElementById("gallery");
    dataBatch.forEach(item => {
        const imageURL = item.url ? item.url.value : "";
        const taxon_name = item.taxon_name ? item.taxon_name.value : "Image";
        const gbif_id = item.gbif_id ? item.gbif_id.value : "Unknown";
        const inat_id = item.inat_id ? item.inat_id.value : "Unknown";
        const bhl_page_id = item.bhl_page_id ? item.bhl_page_id.value : "Unknown";
        const wikidata_id = item.taxon ? item.taxon.value : "";
        const commons_entity_id = item.file ? item.file.value : "";
        const langs = item.langs ? item.langs.value.split(",") : [];

        let gbif_url = "https://www.gbif.org/species/" + encodeURIComponent(gbif_id);
        let bhl_url = "https://www.biodiversitylibrary.org/page/" + encodeURIComponent(bhl_page_id);
        let inat_url = "https://www.inaturalist.org/taxa/" + encodeURIComponent(inat_id);
        let wikidata_url = wikidata_id;
        let commons_url = commons_entity_id;

        const div = document.createElement("div");
        div.className = "gallery-item";

        const img = document.createElement("img");
        img.src = placeholder;
        img.setAttribute("data-src", imageURL);
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

        const wikipediaLinksP = document.createElement("p");
        wikipediaLinksP.textContent = "Wikipedia links: ";
        const all_langs = ["en", "pt", "fr", "es"];
        all_langs.forEach(lang => {
            const wikiLink = document.createElement("a");
            const wikiUrl = `https://${lang}.wikipedia.org/wiki/${encodeURIComponent(taxon_name)}`;
            wikiLink.href = wikiUrl;
            wikiLink.target = "_blank";
            wikiLink.textContent = lang.toUpperCase();
            wikiLink.className = langs.includes(lang) ? "wiki-link-blue" : "wiki-link-red";
            wikipediaLinksP.appendChild(wikiLink);
            wikipediaLinksP.appendChild(document.createTextNode(" | "));
        });
        // Remove the last separator.
        wikipediaLinksP.removeChild(wikipediaLinksP.lastChild);

        legend.appendChild(taxonNameP);
        legend.appendChild(linksP);
        legend.appendChild(wikipediaLinksP);

        div.appendChild(img);
        div.appendChild(legend);
        gallery.appendChild(div);

        // Observe the image for lazy loading.
        observer.observe(img);
    });
}

// Render a batch of images; if reset is true, clear the gallery and restart pagination.
function renderGalleryPaginated(data, reset = false) {
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

    // Add a sentinel element if more images remain.
    if (currentPage * pageSize < data.length) {
        addSentinel();
    }
}

// Create and observe a sentinel element for infinite scrolling.
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
    threshold: 1.0
});

// Fetch images from the Flask endpoint.
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

// Handle the filter form submission by requesting filtered images from Flask.
document.getElementById("filterForm").addEventListener("submit", async function (e) {
    e.preventDefault();
    document.getElementById("loading").style.display = "block";
    document.getElementById('gallery').classList.add('hidden');

    const taxonKey = document.getElementById("taxonSelect").value;
    const continent = document.getElementById("continentSelect").value;
    let endpoint = '/api/filter_images';
    endpoint += `?taxonKey=${taxonKey}&continent=${continent}`;

    try {
        const response = await fetch(endpoint);
        const filteredData = await response.json();
        imagesData = filteredData;
        renderGalleryPaginated(imagesData, true);
    } catch (error) {
        console.error("Error applying filter:", error);
        alert("Error applying filter.");
    } finally {
        document.getElementById("loading").style.display = "none";
        document.getElementById('gallery').classList.remove('hidden');
    }
});

// Reset the filter and display the original images.
document.getElementById("resetFilter").addEventListener("click", function () {
    imagesData = originalImagesData;
    renderGalleryPaginated(imagesData, true);
});

// Initial fetch on page load.
fetchImages();
