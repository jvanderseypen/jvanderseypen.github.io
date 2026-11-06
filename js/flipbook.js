"use strict";

const PAGE_COUNT = 42;
const PAGE_FOLDER = "pages";
const PAGE_EXTENSION = "jpg";
const FADE_DURATION = 180; 
const MIN_ZOOM = 1;
const MAX_ZOOM = 3;
const ZOOM_STEP = 0.25;

const pages = [];

for (let i = 0; i < PAGE_COUNT; i++) {
    pages.push(`${PAGE_FOLDER}/page${i}.${PAGE_EXTENSION}`);
}

let spreadIndex = 0;
let isAnimating = false;

let zoomLevel = 1;

let panX = 0;
let panY = 0;

let isDragging = false;

let dragStartX = 0;
let dragStartY = 0;

let dragStartPanX = 0;
let dragStartPanY = 0;

const leftPage = document.getElementById("leftPage");
const rightPage = document.getElementById("rightPage");
const prevBtn = document.getElementById("prevBtn");
const nextBtn = document.getElementById("nextBtn");
const pageContainer = document.querySelector(".page-container");
const pageIndicator = document.getElementById("pageIndicator");
const pageViewport = document.getElementById("pageViewport");
const zoomInBtn = document.getElementById("zoomInBtn");
const zoomOutBtn = document.getElementById("zoomOutBtn");
const resetZoomBtn = document.getElementById("resetZoomBtn");
const zoomIndicator = document.getElementById("zoomIndicator");

if (
    !leftPage ||
    !rightPage ||
    !prevBtn ||
    !nextBtn ||
    !pageContainer ||
    !pageIndicator ||
    !pageViewport ||
    !zoomInBtn ||
    !zoomOutBtn ||
    !resetZoomBtn ||
    !zoomIndicator
) {
    throw new Error(
        "The flipbook could not find all required HTML elements."
    );
}

function getMaximumSpreadIndex() {
    return Math.ceil(pages.length / 2) - 1;
}

function setPageImage(imageElement, pageIndex) {
    const pageExists = pageIndex >= 0 && pageIndex < pages.length;

    if (pageExists) {
        imageElement.src = pages[pageIndex];
        imageElement.style.visibility = "visible";
        imageElement.alt = `Portfolio page ${pageIndex + 1}`;
        return;
    }

    // imageElement.removeAttribute("src");
    imageElement.style.visibility = "hidden";
    imageElement.alt = "";
}

function updateNavigationButtons() {
    const maximumSpreadIndex = getMaximumSpreadIndex();

    prevBtn.disabled = isAnimating || spreadIndex <= 0;
    nextBtn.disabled = isAnimating || spreadIndex >= maximumSpreadIndex;
}

function updatePageIndicator() {
    const leftPageNumber = spreadIndex * 2 + 1;
    const rightPageNumber = Math.min(leftPageNumber + 1, pages.length);

    if (leftPageNumber === rightPageNumber) {
        pageIndicator.textContent =
            `Page ${leftPageNumber} of ${pages.length}`;
        return;
    }

    pageIndicator.textContent =
        `Pages ${leftPageNumber}-${rightPageNumber} of ${pages.length}`;
}

function clamp(value, minimum, maximum) {
    return Math.min(
        Math.max(value, minimum),
        maximum
    );
}


function constrainPan() {
    if (zoomLevel <= 1) {
        panX = 0;
        panY = 0;
        return;
    }

    const viewportWidth =
        pageViewport.clientWidth;

    const viewportHeight =
        pageViewport.clientHeight;

    const maximumPanX =
        viewportWidth * (zoomLevel - 1) / 2;

    const maximumPanY =
        viewportHeight * (zoomLevel - 1) / 2;

    panX = clamp(
        panX,
        -maximumPanX,
        maximumPanX
    );

    panY = clamp(
        panY,
        -maximumPanY,
        maximumPanY
    );
}


function updateZoomDisplay() {
    constrainPan();

    pageContainer.style.transform =
        `translate(${panX}px, ${panY}px) scale(${zoomLevel})`;

    zoomIndicator.textContent =
        `${Math.round(zoomLevel * 100)}%`;

    zoomOutBtn.disabled =
        zoomLevel <= MIN_ZOOM;

    zoomInBtn.disabled =
        zoomLevel >= MAX_ZOOM;

    resetZoomBtn.disabled =
        zoomLevel === 1 &&
        panX === 0 &&
        panY === 0;

    pageViewport.classList.toggle(
        "is-zoomed",
        zoomLevel > 1
    );
}


function setZoom(newZoomLevel) {
    zoomLevel = clamp(
        newZoomLevel,
        MIN_ZOOM,
        MAX_ZOOM
    );

    if (zoomLevel === 1) {
        panX = 0;
        panY = 0;
    }

    updateZoomDisplay();
}


function zoomIn() {
    setZoom(
        zoomLevel + ZOOM_STEP
    );
}


function zoomOut() {
    setZoom(
        zoomLevel - ZOOM_STEP
    );
}


function resetZoom() {
    zoomLevel = 1;

    panX = 0;
    panY = 0;

    updateZoomDisplay();
}

function renderSpread() {
    const leftIndex = spreadIndex * 2;
    const rightIndex = leftIndex + 1;

    setPageImage(leftPage, leftIndex);
    setPageImage(rightPage, rightIndex);
    updatePageIndicator();
    updateNavigationButtons();
}

function changeSpread(newSpreadIndex) {
    if (isAnimating) {
        return;
    }

    const maximumSpreadIndex = getMaximumSpreadIndex();

    if (newSpreadIndex < 0 || newSpreadIndex > maximumSpreadIndex) {
        return;
    }

    isAnimating = true;
    updateNavigationButtons();
    pageContainer.classList.add("changing-page");

    window.setTimeout(() => {
        spreadIndex = newSpreadIndex;

        resetZoom();
        renderSpread();

        requestAnimationFrame(() => {
            requestAnimationFrame(() => {
                pageContainer.classList.remove("changing-page");

                window.setTimeout(() => {
                    isAnimating = false;
                    updateNavigationButtons();
                }, FADE_DURATION);
            });
        });
    }, FADE_DURATION);
}

function goToNextSpread() {
    const maximumSpreadIndex = getMaximumSpreadIndex();

    if (isAnimating || spreadIndex >= maximumSpreadIndex) {
        return;
    }

    changeSpread(spreadIndex + 1);
}

function goToPreviousSpread() {
    if (isAnimating || spreadIndex <= 0) {
        return;
    }

    changeSpread(spreadIndex - 1);
}

nextBtn.addEventListener("click", goToNextSpread);
prevBtn.addEventListener("click", goToPreviousSpread);

document.addEventListener(
    "keydown",
    (event) => {
        if (event.key === "ArrowRight") {
            goToNextSpread();
        }

        if (event.key === "ArrowLeft") {
            goToPreviousSpread();
        }

        if (
            event.key === "+" ||
            event.key === "="
        ) {
            event.preventDefault();
            zoomIn();
        }

        if (event.key === "-") {
            event.preventDefault();
            zoomOut();
        }

        if (event.key === "0") {
            event.preventDefault();
            resetZoom();
        }
    }
);

function reportImageError(event) {
    console.error(`Could not load portfolio image: ${event.target.src}`);
}

leftPage.addEventListener("error", reportImageError);
rightPage.addEventListener("error", reportImageError);
zoomInBtn.addEventListener(
    "click",
    zoomIn
);

zoomOutBtn.addEventListener(
    "click",
    zoomOut
);

resetZoomBtn.addEventListener(
    "click",
    resetZoom
);
pageViewport.addEventListener(
    "wheel",
    (event) => {
        // /*
        //  * Ctrl is required so normal page scrolling
        //  * is not interrupted accidentally.
        //  */
        // if (!event.ctrlKey) {
        //     return;
        // }

        event.preventDefault();

        if (event.deltaY < 0) {
            zoomIn();
        } else {
            zoomOut();
        }
    },
    { passive: false }
);
pageViewport.addEventListener(
    "pointerdown",
    (event) => {
        if (zoomLevel <= 1) {
            return;
        }

        isDragging = true;

        dragStartX = event.clientX;
        dragStartY = event.clientY;

        dragStartPanX = panX;
        dragStartPanY = panY;

        pageViewport.classList.add(
            "is-dragging"
        );

        pageViewport.setPointerCapture(
            event.pointerId
        );
    }
);


pageViewport.addEventListener(
    "pointermove",
    (event) => {
        if (!isDragging) {
            return;
        }

        panX =
            dragStartPanX +
            event.clientX -
            dragStartX;

        panY =
            dragStartPanY +
            event.clientY -
            dragStartY;

        updateZoomDisplay();
    }
);


function stopDragging(event) {
    if (!isDragging) {
        return;
    }

    isDragging = false;

    pageViewport.classList.remove(
        "is-dragging"
    );

    if (
        event.pointerId !== undefined &&
        pageViewport.hasPointerCapture(
            event.pointerId
        )
    ) {
        pageViewport.releasePointerCapture(
            event.pointerId
        );
    }
}


pageViewport.addEventListener(
    "pointerup",
    stopDragging
);

pageViewport.addEventListener(
    "pointercancel",
    stopDragging
);

updateZoomDisplay();
renderSpread();