// Style switcher for embedding into example pages.
// Note that there are several uses of `window.parent` throughout this file.
// This is because the code is executing from an example
// that is embedded into the page via an iframe.
// As these are served from the same origin, this is allowed by JavaScript.

/**
 * Gets a list of nodes whose text content includes the given string.
 *
 * @param searchText The text to look for in the element text node.
 * @param root The root node to start traversing from.
 * @returns A list of DOM nodes matching the search.
 */
function getNodesByTextContent(searchText, root = window.parent.document.body) {
    const matchingNodes = [];

    function traverse(node) {
        if (node.nodeType === Node.ELEMENT_NODE) {
            node.childNodes.forEach(traverse);
        } else if (node.nodeType === Node.TEXT_NODE) {
            if (node.nodeValue.includes(searchText)) {
                matchingNodes.push(node);
            }
        }
    }

    traverse(root);

    return matchingNodes.map(node => node.parentNode); // Return parent nodes of the matching text nodes
}

/**
 * Gets the current map style slug from the query string.
 * @returns {string}
 */
function getMapStyleQueryParam() {
    const url = new URL(window.parent.location.href);
    return url.searchParams.get('mapStyle');
}

/**
 * Sets the map style slug in the browser's query string
 * (ex: when the user selects a new style).
 * @param styleKey
 */
function setMapStyleQueryParam(styleKey) {
    const url = new URL(window.parent.location.href);
    if (url.searchParams.get('mapStyle') !== styleKey) {
        url.searchParams.set('mapStyle', styleKey);
        // TODO: Observe URL changes ex: forward and back
        // Manipulates the window history so that the page doesn't reload.
        window.parent.history.pushState(null, '', url);
    }
}

class StyleSwitcherControl {
    constructor () {
        this.el = document.createElement('div');
    }

    onAdd (_) {
        this.el.className = 'maplibregl-ctrl';

        const select = document.createElement('select');
        select.oninput = (event) => {
            const styleKey = event.target.value;
            const style = availableMapStyles[styleKey];
            this.setStyle(styleKey, style);
        };

        const mapStyleKey = getMapStyleQueryParam();

        for (const key in availableMapStyles) {
            if (availableMapStyles.hasOwnProperty(key)) {
                const style = availableMapStyles[key];
                let selected = '';

                // As we go through the styles, look for it in the rendered example.
                if (this.styleURLNode === undefined && getNodesByTextContent(style.styleUrl)) {
                    this.styleURLNode = getNodesByTextContent(style.styleUrl)[0];
                }

                if (key === mapStyleKey) {
                    selected = ' selected';
                    this.setStyle(key, style);
                }

                select.insertAdjacentHTML('beforeend', `<option value="${key}"${selected}>${style.name}</option>`);
            }
        }

        // Add the select to the element
        this.el.append(select);

        return this.el;
    }

    onRemove (_) {
        // Remove all children
        this.el.replaceChildren()
    }

    setStyle(styleKey, style) {
        // Change the map style
        map.setStyle(style.styleUrl)

        // Update the example
        this.styleURLNode.innerText = `'${style.styleUrl}'`;

        // Update the URL
        setMapStyleQueryParam(styleKey);
    }
}

map.addControl(new StyleSwitcherControl(), 'top-left');
