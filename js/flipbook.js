
"use strict";

import * as pdfjsLib from
    "../vendor/pdfjs/pdf.mjs";


/* --------------------------------
   PDF.JS CONFIGURATION
-------------------------------- */

const PDF_WORKER_URL =
    new URL(
        "../vendor/pdfjs/pdf.worker.mjs",
        import.meta.url
    ).href;

const PDF_URL =
    new URL(
        "../documents/portfolio.pdf",
        import.meta.url
    ).href;

pdfjsLib.GlobalWorkerOptions.workerSrc =
    PDF_WORKER_URL;

const FADE_DURATION = 180;

const MIN_ZOOM = 1;
const MAX_ZOOM = 3;
const ZOOM_STEP = 0.25;

const RENDER_DEBOUNCE_DURATION = 120;


/* --------------------------------
   APPLICATION STATE
-------------------------------- */

let pdfDocument = null;
let pageCount = 0;

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

let renderTimeout = null;

/*
 * A generation number lets us ignore an old render
 * after another render has already begun.
 */
let renderGeneration = 0;

const activeRenderTasks = new Map();


/* --------------------------------
   DOM ELEMENTS
-------------------------------- */

const leftPage = document.getElementById("leftPage");
const rightPage = document.getElementById("rightPage");

const prevBtn = document.getElementById("prevBtn");
const nextBtn = document.getElementById("nextBtn");

const pageContainer =
    document.querySelector(".page-container");

const pageIndicator =
    document.getElementById("pageIndicator");

const pageViewport =
    document.getElementById("pageViewport");

const zoomInBtn =
    document.getElementById("zoomInBtn");

const zoomOutBtn =
    document.getElementById("zoomOutBtn");

const resetZoomBtn =
    document.getElementById("resetZoomBtn");

const zoomIndicator =
    document.getElementById("zoomIndicator");

const loadingMessage =
    document.getElementById("loadingMessage");


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
    !zoomIndicator ||
    !loadingMessage
) {
    throw new Error(
        "The flipbook could not find all required HTML elements."
    );
}


/* --------------------------------
   GENERAL HELPERS
-------------------------------- */

function clamp(value, minimum, maximum) {
    return Math.min(
        Math.max(value, minimum),
        maximum
    );
}


function isMobileLayout() {
    return window.matchMedia(
        "(max-width: 600px)"
    ).matches;
}


function getMaximumSpreadIndex() {
    if (pageCount === 0) {
        return 0;
    }

    return Math.ceil(pageCount / 2) - 1;
}


/* --------------------------------
   CANVAS HELPERS
-------------------------------- */

function clearCanvas(canvas) {
    const context = canvas.getContext("2d");

    if (context) {
        context.clearRect(
            0,
            0,
            canvas.width,
            canvas.height
        );
    }

    canvas.width = 1;
    canvas.height = 1;

    canvas.classList.add("is-hidden");
    canvas.removeAttribute("aria-label");
}


function cancelActiveRender(canvas) {
    const renderTask =
        activeRenderTasks.get(canvas);

    if (!renderTask) {
        return;
    }

    renderTask.cancel();
    activeRenderTasks.delete(canvas);
}


/* --------------------------------
   PDF PAGE RENDERING
-------------------------------- */

async function renderPdfPage(
    canvas,
    pageNumber,
    generation
) {
    if (
        !pdfDocument ||
        pageNumber < 1 ||
        pageNumber > pageCount
    ) {
        cancelActiveRender(canvas);
        clearCanvas(canvas);
        return;
    }

    cancelActiveRender(canvas);

    const page =
        await pdfDocument.getPage(pageNumber);

    /*
     * Stop if a more recent render has started while
     * this PDF page was loading.
     */
    if (generation !== renderGeneration) {
        return;
    }

    const unscaledViewport =
        page.getViewport({ scale: 1 });


    /*
    * Maximum space available to one PDF page.
    *
    * On desktop, two pages share the available width.
    * On mobile, one page uses the complete width.
    */
    const maximumCssWidth =
        isMobileLayout()
            ? pageContainer.clientWidth
            : pageContainer.clientWidth / 2;

    /*
    * Reserve vertical room for:
    *
    * - body padding
    * - page controls
    * - spacing below the book
    *
    * This ensures that 100% zoom displays the complete page.
    */
    const verticalSpaceReserved =
        isMobileLayout()
            ? 170
            : 110;

    const maximumCssHeight =
        Math.max(
            100,
            window.innerHeight - verticalSpaceReserved
        );

    /*
    * Determine how large the PDF page can be while fitting
    * inside both the available width and height.
    */
    const widthScale =
        maximumCssWidth /
        unscaledViewport.width;

    const heightScale =
        maximumCssHeight /
        unscaledViewport.height;

    const fitScale =
        Math.min(
            widthScale,
            heightScale
        );

    const availableCssWidth =
        unscaledViewport.width *
        fitScale;

    const availableCssHeight =
        unscaledViewport.height *
        fitScale;

    /*
     * Render at the visible CSS width multiplied by the
     * current zoom and device pixel ratio.
     *
     * The CSS transform controls the visible zoom.
     * The larger internal canvas resolution prevents
     * the PDF page from becoming blurry.
     */
    const outputScale =
        window.devicePixelRatio || 1;

    const desiredRenderWidth =
        availableCssWidth *
        zoomLevel *
        outputScale;

    const pdfScale =
        desiredRenderWidth /
        unscaledViewport.width;

    const renderViewport =
        page.getViewport({
            scale: pdfScale
        });

    canvas.width =
        Math.floor(renderViewport.width);

    canvas.height =
        Math.floor(renderViewport.height);

    /*
     * The CSS width stays at the unzoomed page width.
     * pageContainer's transform applies the visible zoom.
     */
    canvas.style.width =
        `${availableCssWidth}px`;

    canvas.style.height =
        `${availableCssHeight}px`;

    canvas.classList.remove("is-hidden");

    canvas.setAttribute(
        "aria-label",
        `Portfolio page ${pageNumber}`
    );

    const context = canvas.getContext(
        "2d",
        {
            alpha: false
        }
    );

    context.save();

    context.fillStyle = "#ffffff";

    context.fillRect(
        0,
        0,
        canvas.width,
        canvas.height
    );

    context.restore();

    const renderTask = page.render({
        canvasContext: context,
        viewport: renderViewport
    });

    activeRenderTasks.set(
        canvas,
        renderTask
    );

    try {
        await renderTask.promise;
    } catch (error) {
        /*
         * RenderingCancelledException is expected when
         * zooming or changing pages quickly.
         */
        if (
            error?.name !==
            "RenderingCancelledException"
        ) {
            throw error;
        }
    } finally {
        if (
            activeRenderTasks.get(canvas) ===
            renderTask
        ) {
            activeRenderTasks.delete(canvas);
        }
    }
}


/* --------------------------------
   SPREAD RENDERING
-------------------------------- */

async function renderSpread() {
    if (!pdfDocument) {
        return;
    }

    const leftPageNumber =
        spreadIndex * 2 + 1;

    const rightPageNumber =
        leftPageNumber + 1;

    renderGeneration += 1;

    const currentGeneration =
        renderGeneration;

    const renderOperations = [
        renderPdfPage(
            leftPage,
            leftPageNumber,
            currentGeneration
        )
    ];

    if (!isMobileLayout()) {
        renderOperations.push(
            renderPdfPage(
                rightPage,
                rightPageNumber,
                currentGeneration
            )
        );
    } else {
        cancelActiveRender(rightPage);
        clearCanvas(rightPage);
    }

    try {
        await Promise.all(renderOperations);
    } catch (error) {
        console.error(
            "Could not render the PDF spread:",
            error
        );
    }

    updatePageIndicator();
    updateNavigationButtons();
}


/* --------------------------------
   DEBOUNCED RENDERING
-------------------------------- */

function scheduleSpreadRender() {
    window.clearTimeout(renderTimeout);

    renderTimeout = window.setTimeout(
        () => {
            renderSpread();
        },
        RENDER_DEBOUNCE_DURATION
    );
}


/* --------------------------------
   PAGE INDICATOR
-------------------------------- */

function updatePageIndicator() {
    if (pageCount === 0) {
        pageIndicator.textContent = "";
        return;
    }

    const leftPageNumber =
        spreadIndex * 2 + 1;

    const rightPageNumber =
        Math.min(
            leftPageNumber + 1,
            pageCount
        );

    if (isMobileLayout()) {
        pageIndicator.textContent =
            `Page ${leftPageNumber} of ${pageCount}`;

        return;
    }

    if (leftPageNumber === rightPageNumber) {
        pageIndicator.textContent =
            `Page ${leftPageNumber} of ${pageCount}`;

        return;
    }

    pageIndicator.textContent =
        `Pages ${leftPageNumber}-${rightPageNumber} ` +
        `of ${pageCount}`;
}


/* --------------------------------
   NAVIGATION
-------------------------------- */

function updateNavigationButtons() {
    const maximumSpreadIndex =
        getMaximumSpreadIndex();

    const documentUnavailable =
        !pdfDocument;

    prevBtn.disabled =
        documentUnavailable ||
        isAnimating ||
        spreadIndex <= 0;

    nextBtn.disabled =
        documentUnavailable ||
        isAnimating ||
        spreadIndex >= maximumSpreadIndex;
}


async function changeSpread(newSpreadIndex) {
    if (
        isAnimating ||
        !pdfDocument
    ) {
        return;
    }

    const maximumSpreadIndex =
        getMaximumSpreadIndex();

    if (
        newSpreadIndex < 0 ||
        newSpreadIndex > maximumSpreadIndex
    ) {
        return;
    }

    isAnimating = true;

    updateNavigationButtons();

    pageContainer.classList.add(
        "changing-page"
    );

    window.setTimeout(
        async () => {
            spreadIndex = newSpreadIndex;

            resetZoom(false);

            await renderSpread();

            requestAnimationFrame(
                () => {
                    requestAnimationFrame(
                        () => {
                            pageContainer.classList.remove(
                                "changing-page"
                            );

                            window.setTimeout(
                                () => {
                                    isAnimating = false;
                                    updateNavigationButtons();
                                },
                                FADE_DURATION
                            );
                        }
                    );
                }
            );
        },
        FADE_DURATION
    );
}


function goToNextSpread() {
    const maximumSpreadIndex =
        getMaximumSpreadIndex();

    if (
        isAnimating ||
        spreadIndex >= maximumSpreadIndex
    ) {
        return;
    }

    changeSpread(spreadIndex + 1);
}


function goToPreviousSpread() {
    if (
        isAnimating ||
        spreadIndex <= 0
    ) {
        return;
    }

    changeSpread(spreadIndex - 1);
}


/* --------------------------------
   ZOOM AND PAN
-------------------------------- */

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
        viewportWidth *
        (zoomLevel - 1) / 2;

    const maximumPanY =
        viewportHeight *
        (zoomLevel - 1) / 2;

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
        `translate(${panX}px, ${panY}px) ` +
        `scale(${zoomLevel})`;

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
    const previousZoomLevel =
        zoomLevel;

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

    if (
        zoomLevel !== previousZoomLevel
    ) {
        scheduleSpreadRender();
    }
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


function resetZoom(shouldRender = true) {
    const zoomChanged =
        zoomLevel !== 1;

    zoomLevel = 1;

    panX = 0;
    panY = 0;

    updateZoomDisplay();

    if (
        shouldRender &&
        zoomChanged
    ) {
        scheduleSpreadRender();
    }
}


/* --------------------------------
   EVENT LISTENERS
-------------------------------- */

nextBtn.addEventListener(
    "click",
    goToNextSpread
);

prevBtn.addEventListener(
    "click",
    goToPreviousSpread
);

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
    () => {
        resetZoom(true);
    }
);


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
            resetZoom(true);
        }
    }
);


pageViewport.addEventListener(
    "wheel",
    (event) => {
        if (!event.ctrlKey) {
            return;
        }

        event.preventDefault();

        if (event.deltaY < 0) {
            zoomIn();
        } else {
            zoomOut();
        }
    },
    {
        passive: false
    }
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


/*
 * Re-render after resizing because the width available
 * to each PDF page may have changed.
 */
let resizeTimeout = null;

window.addEventListener(
    "resize",
    () => {
        window.clearTimeout(
            resizeTimeout
        );

        resizeTimeout = window.setTimeout(
            () => {
                resetZoom(false);
                renderSpread();
            },
            150
        );
    }
);


/* --------------------------------
   PDF INITIALIZATION
-------------------------------- */

async function loadPortfolio() {
    updateNavigationButtons();

    try {
        console.log(
            "Loading PDF from:",
            PDF_URL
        );

        const loadingTask =
            pdfjsLib.getDocument({
                url: PDF_URL,
                rangeChunkSize: 262144,
                disableRange: false,
                disableStream: false,
                disableAutoFetch: true
            });

        pdfDocument =
            await loadingTask.promise;

        pageCount =
            pdfDocument.numPages;

        if (pageCount === 0) {
            throw new Error(
                "The PDF does not contain any pages."
            );
        }

        loadingMessage.classList.add(
            "is-hidden"
        );

        updateZoomDisplay();

        await renderSpread();
    } catch (error) {
        console.error(
            "Could not load the portfolio PDF:",
            error
        );

        loadingMessage.textContent =
            "The portfolio PDF could not be loaded.";

        pageIndicator.textContent =
            "Portfolio unavailable";

        updateNavigationButtons();
    }
}


loadPortfolio();