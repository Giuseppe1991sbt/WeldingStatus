let API = null;
let currentWeld = null;
let trimbleAccessToken = null;
let psetBaseUrl = null;


// --------------------------------------------------
// REAL TRIMBLE PROPERTY SET IDENTIFIERS
// --------------------------------------------------

const LIBRARY_ID =
    "7r7dk7c43tlshjqgmj5urdjbyrtsssh0";

const DEFINITION_ID =
    "uvq7wy0xgvb2o2sxornh5juywnqsn76w";

const WELD_STATUS_PROPERTY_ID =
    "prop_k57dohz4v8wj0sploxwvjt8jhn7jn605";


// --------------------------------------------------
// STATUS COLOURS
// --------------------------------------------------

const statuses = {
    "Not Started": "#808080",
    "Part Completed": "#FFD700",
    "Weld Complete": "#2684FF",
    "VT/PT Inspection Completed": "#8E44AD",
    "NDT Passed": "#2E9D50",
    "NDT Failed / Remedial Works Required": "#D32F2F",
    "Fully Complete / Closed Out": "#006B3C"
};


// --------------------------------------------------
// START
// --------------------------------------------------

async function start() {

    const box =
        document.getElementById("status");

    try {

        box.innerHTML =
            "Connecting to Trimble Connect...";

        API =
            await TrimbleConnectWorkspace.connect(
                window.parent,
                onEvent
            );


        // ------------------------------------------
        // GET PROJECT
        // ------------------------------------------

        const project =
            await API.project.getProject();

        console.log(
            "CURRENT TRIMBLE PROJECT:",
            project
        );


        // ------------------------------------------
        // GET ACCESS TOKEN
        // ------------------------------------------

        box.innerHTML =
            "Requesting Trimble access permission...";

        trimbleAccessToken =
            await API.extension.requestPermission(
                "accesstoken"
            );

        if (!trimbleAccessToken) {

            throw new Error(
                "Trimble Connect did not return an access token."
            );
        }


        // ------------------------------------------
        // DISCOVER REGIONAL PSET SERVICE
        // ------------------------------------------

        box.innerHTML =
            "Finding the Trimble Property Set service...";

        psetBaseUrl =
            await discoverPsetBaseUrl(
                project,
                trimbleAccessToken
            );

        console.log(
            "PROPERTY SET BASE URL:",
            psetBaseUrl
        );


        // ------------------------------------------
        // READY
        // ------------------------------------------

        box.innerHTML =
            "<strong style=\"color:#006b3c;\">" +
            "Connected to Trimble Connect" +
            "</strong>" +
            "<br><br>" +
            "Shared Property Set service connected." +
            "<br><br>" +
            "Select one weld in the 3D model.";

    } catch (error) {

        console.error(
            "START-UP FAILED:",
            error
        );

        showError(error);
    }
}


// --------------------------------------------------
// DISCOVER PROPERTY SET SERVICE
// --------------------------------------------------

async function discoverPsetBaseUrl(
    project,
    token
) {

    const response =
        await fetch(
            "https://app.connect.trimble.com/tc/api/2.0/regions",
            {
                method: "GET",

                headers: {
                    "Accept":
                        "application/json",

                    "Authorization":
                        "Bearer " + token
                }
            }
        );

    if (!response.ok) {

        throw new Error(
            "Regions API returned HTTP " +
            response.status
        );
    }

    const regions =
        await response.json();

    const projectLocation =
        String(
            project && project.location
                ? project.location
                : ""
        ).toLowerCase();

    const region =
        findEuropeRegion(
            regions,
            projectLocation
        );

    if (!region) {

        throw new Error(
            "Could not identify the Trimble Europe region."
        );
    }

    const psetApi =
        region["pset-api"] ||
        region.psetApi ||
        (
            region.services
                ? region.services["pset-api"]
                : null
        ) ||
        (
            region.services
                ? region.services.psetApi
                : null
        );

    if (!psetApi) {

        throw new Error(
            "The Trimble Europe region did not return a Property Set API URL."
        );
    }

    return String(psetApi).endsWith("/")
        ? String(psetApi)
        : String(psetApi) + "/";
}


// --------------------------------------------------
// FIND EUROPE REGION
// --------------------------------------------------

function findEuropeRegion(
    regions,
    projectLocation
) {

    if (!Array.isArray(regions)) {
        return null;
    }

    const exact =
        regions.find(
            function(region) {

                const values =
                    [
                        region.location,
                        region.name,
                        region.trmRegion,
                        region.region,
                        region.awsRegion
                    ]
                    .filter(Boolean)
                    .map(
                        function(value) {

                            return String(value)
                                .toLowerCase();
                        }
                    );

                return values.some(
                    function(value) {

                        return (
                            value === projectLocation ||
                            value === "europe" ||
                            value === "eu" ||
                            value.includes("europe")
                        );
                    }
                );
            }
        );

    if (exact) {
        return exact;
    }

    return regions.find(
        function(region) {

            const text =
                safeJson(region)
                    .toLowerCase();

            return (
                text.includes("europe") ||
                text.includes("\"eu\"") ||
                text.includes("app21")
            );
        }
    );
}


// --------------------------------------------------
// TRIMBLE EVENTS
// --------------------------------------------------

async function onEvent(
    event,
    data
) {

    console.log(
        "Trimble event:",
        event,
        data
    );

    if (
        event === "viewer.onSelectionChanged" ||
        event === "selectionChanged"
    ) {

        await readWeld();
    }
}


// --------------------------------------------------
// READ SELECTED WELD
// --------------------------------------------------

async function readWeld() {

    try {

        const selection =
            await API.viewer.getSelection();

        if (
            !selection ||
            selection.length === 0
        ) {

            currentWeld = null;

            document
                .getElementById("status")
                .innerHTML =
                "Select one weld in the model.";

            return;
        }

        const selected =
            selection[0];

        if (
            !selected.objectRuntimeIds ||
            selected.objectRuntimeIds.length === 0
        ) {

            return;
        }

        const modelId =
            selected.modelId;

        const runtimeId =
            selected.objectRuntimeIds[0];


        // ------------------------------------------
        // READ NORMAL MODEL PROPERTIES
        // ------------------------------------------

        const result =
            await API.viewer.getObjectProperties(
                modelId,
                [runtimeId]
            );

        console.log(
            "RAW TRIMBLE PROPERTIES:",
            result
        );

        const flat = {};

        flatten(
            result,
            flat
        );


        // ------------------------------------------
        // GET IFC OBJECT ID
        // ------------------------------------------

        const convertedIds =
            await API.viewer.convertToObjectIds(
                modelId,
                [runtimeId]
            );

        const externalId =
            extractObjectId(
                convertedIds
            );

        if (!externalId) {

            throw new Error(
                "Trimble did not return an IFC/Object ID for the selected weld."
            );
        }

        const psetLink =
            "frn:entity:" + externalId;

        console.log(
            "WELD OBJECT ID:",
            externalId
        );

        console.log(
            "WELD PSET LINK:",
            psetLink
        );


        // ------------------------------------------
        // READ SHARED PSET FROM TRIMBLE CLOUD
        // ------------------------------------------

        const sharedPset =
            await getSharedPset(
                psetLink
            );

        const sharedStatus =
            getPsetProperty(
                sharedPset,
                WELD_STATUS_PROPERTY_ID
            );

        console.log(
            "SHARED PSET:",
            sharedPset
        );

        console.log(
            "SHARED WELD STATUS:",
            sharedStatus
        );


        // ------------------------------------------
        // BUILD CURRENT WELD
        // ------------------------------------------

        currentWeld = {

            modelId:
                modelId,

            runtimeId:
                runtimeId,

            externalId:
                externalId,

            psetLink:
                psetLink,

            psetVersion:
                getPsetVersion(
                    sharedPset
                ),

            schemaVersion:
                getSchemaVersion(
                    sharedPset
                ),

            weldId:
                getProp(
                    flat,
                    [
                        "weld id",
                        "weld number"
                    ]
                ),

            type:
                getProp(
                    flat,
                    [
                        "weld type"
                    ]
                ),

            purpose:
                getProp(
                    flat,
                    [
                        "weld purpose"
                    ]
                ),

            length:
                getProp(
                    flat,
                    [
                        "weld length (mm)",
                        "weld length"
                    ]
                ),

            throat:
                getProp(
                    flat,
                    [
                        "weld throat (mm)",
                        "weld throat"
                    ]
                ),

            cage:
                getProp(
                    flat,
                    [
                        "weld cage id",
                        "embed cage id"
                    ]
                ),

            detail:
                getProp(
                    flat,
                    [
                        "detail"
                    ]
                ),

            father:
                getProp(
                    flat,
                    [
                        "father id"
                    ]
                ),

            sharedStatus:
                sharedStatus
        };


        renderPanel();

    } catch (error) {

        showError(error);
    }
}


// --------------------------------------------------
// EXTRACT IFC / OBJECT ID
// --------------------------------------------------

function extractObjectId(ids) {

    if (
        !ids ||
        !Array.isArray(ids) ||
        ids.length === 0
    ) {

        return "";
    }

    const first =
        ids[0];

    if (
        first === null ||
        first === undefined
    ) {

        return "";
    }

    if (
        typeof first === "string" ||
        typeof first === "number"
    ) {

        return String(first);
    }

    if (typeof first === "object") {

        return String(
            first.id ||
            first.objectId ||
            first.externalId ||
            first.guid ||
            first.value ||
            ""
        );
    }

    return "";
}


// --------------------------------------------------
// BUILD REAL PSET URL
// --------------------------------------------------

function getPsetUrl(psetLink) {

    if (!psetBaseUrl) {

        throw new Error(
            "The Trimble Property Set service is not connected."
        );
    }

    return (
        psetBaseUrl +
        "psets/" +
        encodeURIComponent(psetLink) +
        "/" +
        encodeURIComponent(LIBRARY_ID) +
        "/" +
        encodeURIComponent(DEFINITION_ID)
    );
}


// --------------------------------------------------
// READ SHARED PSET
// --------------------------------------------------

async function getSharedPset(psetLink) {

    const url =
        getPsetUrl(
            psetLink
        );

    const response =
        await fetch(
            url,
            {
                method: "GET",

                headers: {
                    "Accept":
                        "application/json",

                    "Authorization":
                        "Bearer " +
                        trimbleAccessToken
                }
            }
        );

    const data =
        await readResponseData(
            response
        );

    if (response.status === 404) {

        console.warn(
            "No shared PSet instance exists for:",
            psetLink
        );

        return null;
    }

    if (!response.ok) {

        throw new Error(
            "Could not read the shared Weld Progress PSet." +
            "\nHTTP " +
            response.status +
            "\n\n" +
            safeJson(data)
        );
    }

    return data;
}


// --------------------------------------------------
// READ PSET PROPERTY
// --------------------------------------------------

function getPsetProperty(
    pset,
    propertyId
) {

    if (
        !pset ||
        !pset.props
    ) {

        return "";
    }

    const value =
        pset.props[propertyId];

    if (
        value === null ||
        value === undefined
    ) {

        return "";
    }

    return String(value);
}


// --------------------------------------------------
// READ PSET VERSION
// --------------------------------------------------

function getPsetVersion(pset) {

    if (
        pset &&
        Number.isFinite(
            Number(pset.v)
        )
    ) {

        return Number(pset.v);
    }

    return 0;
}


// --------------------------------------------------
// READ SCHEMA VERSION
// --------------------------------------------------

function getSchemaVersion(pset) {

    if (
        pset &&
        Number.isFinite(
            Number(pset.schemaV)
        )
    ) {

        return Number(pset.schemaV);
    }

    return 0;
}


// --------------------------------------------------
// FLATTEN MODEL PROPERTIES
// --------------------------------------------------

function flatten(
    input,
    output
) {

    if (
        input === null ||
        input === undefined
    ) {

        return;
    }

    if (Array.isArray(input)) {

        input.forEach(
            function(item) {

                flatten(
                    item,
                    output
                );
            }
        );

        return;
    }

    if (
        typeof input !== "object"
    ) {

        return;
    }

    if (
        input.name !== undefined &&
        input.value !== undefined
    ) {

        output[
            String(input.name)
                .trim()
                .toLowerCase()
        ] =
            safeValue(
                input.value
            );
    }

    Object.entries(input)
        .forEach(
            function(entry) {

                const key =
                    entry[0];

                const value =
                    entry[1];

                if (
                    value !== null &&
                    value !== undefined &&
                    typeof value !== "object"
                ) {

                    output[
                        String(key)
                            .trim()
                            .toLowerCase()
                    ] =
                        safeValue(value);
                }

                flatten(
                    value,
                    output
                );
            }
        );
}


// --------------------------------------------------
// SAFE VALUE
// --------------------------------------------------

function safeValue(value) {

    if (
        value === null ||
        value === undefined
    ) {

        return "";
    }

    if (
        typeof value === "bigint"
    ) {

        return value.toString();
    }

    return String(value);
}


// --------------------------------------------------
// NORMAL PROPERTY LOOKUP
// --------------------------------------------------

function getProp(
    flat,
    names
) {

    for (
        const name of names
    ) {

        if (
            flat[name] !== undefined &&
            flat[name] !== ""
        ) {

            return flat[name];
        }
    }

    for (
        const entry
        of Object.entries(flat)
    ) {

        const key =
            entry[0];

        const value =
            entry[1];

        for (
            const name of names
        ) {

            if (
                key.includes(name) &&
                value
            ) {

                return value;
            }
        }
    }

    return "";
}


// --------------------------------------------------
// APPLY STATUS COLOUR
// --------------------------------------------------

async function applyColour(status) {

    if (
        !API ||
        !currentWeld ||
        !statuses[status]
    ) {

        return;
    }

    const selector = {

        modelObjectIds: [
            {
                modelId:
                    currentWeld.modelId,

                objectRuntimeIds: [
                    currentWeld.runtimeId
                ]
            }
        ]
    };

    await API.viewer.setObjectState(
        selector,
        {
            color:
                statuses[status],

            visible:
                true
        }
    );
}


// --------------------------------------------------
// RENDER PANEL
// --------------------------------------------------

function renderPanel() {

    const sharedValid =
        Object.prototype
            .hasOwnProperty
            .call(
                statuses,
                currentWeld.sharedStatus
            );

    const currentStatus =
        sharedValid
            ? currentWeld.sharedStatus
            : "Not Started";

    const source =
        sharedValid
            ? "Shared Trimble Property Set"
            : "No shared status found";

    const colour =
        statuses[currentStatus];

    applyColour(
        currentStatus
    ).catch(
        function(error) {

            console.error(
                "Colour error:",
                error
            );
        }
    );

    const options =
        Object.keys(statuses)
            .map(
                function(status) {

                    const selected =
                        status === currentStatus
                            ? "selected"
                            : "";

                    return (
                        "<option " +
                        "value=\"" +
                        escapeHtml(status) +
                        "\" " +
                        selected +
                        ">" +
                        escapeHtml(status) +
                        "</option>"
                    );
                }
            )
            .join("");

    document
        .getElementById("status")
        .innerHTML =

        "<div style=\"" +
        "border-left:8px solid " +
        colour +
        ";" +
        "padding-left:12px;" +
        "\">" +

        "<small>WELD ID</small>" +

        "<div style=\"" +
        "font-size:24px;" +
        "font-weight:bold;" +
        "margin-bottom:16px;" +
        "\">" +
        escapeHtml(
            currentWeld.weldId
        ) +
        "</div>" +

        field(
            "Type",
            currentWeld.type
        ) +

        field(
            "Purpose",
            currentWeld.purpose
        ) +

        field(
            "Length",
            withMM(
                currentWeld.length
            )
        ) +

        field(
            "Throat",
            withMM(
                currentWeld.throat
            )
        ) +

        field(
            "Cage",
            currentWeld.cage
        ) +

        field(
            "Detail",
            currentWeld.detail
        ) +

        field(
            "Father ID",
            currentWeld.father
        ) +

        "<hr>" +

        "<strong>Weld status</strong>" +

        "<div style=\"" +
        "font-size:11px;" +
        "color:" +
        (
            sharedValid
                ? "#006b3c"
                : "#b35c00"
        ) +
        ";" +
        "margin-top:4px;" +
        "margin-bottom:8px;" +
        "\">" +

        "Source: <strong>" +
        escapeHtml(source) +
        "</strong>" +

        "</div>" +

        "<select " +
        "id=\"weldStatusSelect\" " +
        "style=\"" +
        "width:100%;" +
        "padding:9px;" +
        "margin-bottom:12px;" +
        "\">" +

        options +

        "</select>" +

        "<button " +
        "id=\"saveButton\" " +
        "style=\"" +
        "width:100%;" +
        "margin-top:12px;" +
        "padding:11px;" +
        "background:#0063a6;" +
        "color:white;" +
        "border:none;" +
        "border-radius:4px;" +
        "font-weight:bold;" +
        "cursor:pointer;" +
        "\">" +

        "SAVE WELD STATUS" +

        "</button>" +

        "<div " +
        "id=\"saveMessage\" " +
        "style=\"margin-top:10px;\">" +
        "</div>" +

        "<details style=\"margin-top:15px;\">" +

        "<summary>" +
        "Technical object information" +
        "</summary>" +

        "<br>" +

        "<strong>Model ID</strong>" +
        "<br>" +
        escapeHtml(
            currentWeld.modelId
        ) +

        "<br><br>" +

        "<strong>IFC / Object ID</strong>" +
        "<br>" +
        escapeHtml(
            currentWeld.externalId
        ) +

        "<br><br>" +

        "<strong>PSet link</strong>" +
        "<br>" +
        escapeHtml(
            currentWeld.psetLink
        ) +

        "<br><br>" +

        "<strong>Shared status</strong>" +
        "<br>" +
        escapeHtml(
            currentWeld.sharedStatus ||
            "Not found"
        ) +

        "<br><br>" +

        "<strong>PSet version</strong>" +
        "<br>" +
        escapeHtml(
            currentWeld.psetVersion
        ) +

        "</details>" +

        "</div>";

    document
        .getElementById("saveButton")
        .addEventListener(
            "click",
            saveStatus
        );
}


// --------------------------------------------------
// SAVE SHARED STATUS TO TRIMBLE
// --------------------------------------------------

async function saveStatus() {

    const button =
        document.getElementById(
            "saveButton"
        );

    const message =
        document.getElementById(
            "saveMessage"
        );

    const status =
        document
            .getElementById(
                "weldStatusSelect"
            )
            .value;

    button.disabled =
        true;

    button.textContent =
        "SAVING...";

    message.style.color =
        "#333333";

    message.textContent =
        "Writing status to the Trimble cloud...";

    try {

        if (!currentWeld) {

            throw new Error(
                "No weld is currently selected."
            );
        }

        if (!trimbleAccessToken) {

            throw new Error(
                "The Trimble access token is unavailable."
            );
        }


        // ------------------------------------------
        // GET LATEST VERSION BEFORE PATCH
        // ------------------------------------------

        const latestPset =
            await getSharedPset(
                currentWeld.psetLink
            );

        const latestVersion =
            getPsetVersion(
                latestPset
            );

        const latestSchemaVersion =
            getSchemaVersion(
                latestPset
            );


        // ------------------------------------------
        // MATCH NATIVE TRIMBLE PAYLOAD
        // ------------------------------------------

        
        const existingProps =
    latestPset &&
    latestPset.props &&
    typeof latestPset.props === "object"
        ? { ...latestPset.props }
        : {};


// --------------------------------------------------
// WELD STATUS
// --------------------------------------------------

existingProps[
    WELD_STATUS_PROPERTY_ID
] =
    status;


// --------------------------------------------------
// REQUIRED WELD PROGRESS PROPERTIES
// Values confirmed from native Trimble PATCH
// --------------------------------------------------

existingProps[
    "prop_48mef50zi9v7bm5b5mi5v9f961975kfo"
] =
    existingProps[
        "prop_48mef50zi9v7bm5b5mi5v9f961975kfo"
    ] ?? "Not Required";


existingProps[
    "prop_wuxnu0maffve5478u3rse3bkbd5dh4sk"
] =
    existingProps[
        "prop_wuxnu0maffve5478u3rse3bkbd5dh4sk"
    ] ?? false;


// --------------------------------------------------
// BUILD PATCH PAYLOAD
// --------------------------------------------------

const writeBody = {

    link:
        currentWeld.psetLink,

    libId:
        LIBRARY_ID,

    defId:
        DEFINITION_ID,

    props:
        existingProps,

    schemaV:
        latestSchemaVersion,

    v:
        latestVersion + 1
};


        console.log(
            "TRIMBLE PATCH PAYLOAD:",
            writeBody
        );


        const response =
            await fetch(
                getPsetUrl(
                    currentWeld.psetLink
                ),
                {
                    method: "PATCH",

                    headers: {
                        "Accept":
                            "application/json",

                        "Content-Type":
                            "application/json",

                        "Authorization":
                            "Bearer " +
                            trimbleAccessToken
                    },

                    body:
                        JSON.stringify(
                            writeBody
                        )
                }
            );


        const responseData =
            await readResponseData(
                response
            );


        if (!response.ok) {

            throw new Error(
                "Trimble PATCH returned HTTP " +
                response.status +
                "\n\n" +
                safeJson(responseData)
            );
        }


        // ------------------------------------------
        // READ BACK FROM CLOUD
        // ------------------------------------------

        await wait(
            750
        );

        const confirmedPset =
            await getSharedPset(
                currentWeld.psetLink
            );

        const confirmedStatus =
            getPsetProperty(
                confirmedPset,
                WELD_STATUS_PROPERTY_ID
            );


        if (
            confirmedStatus !== status
        ) {

            throw new Error(
                "Trimble accepted the write, but the read-back value was '" +
                (
                    confirmedStatus ||
                    "empty"
                ) +
                "' instead of '" +
                status +
                "'."
            );
        }


        // ------------------------------------------
        // UPDATE LOCAL UI FROM CONFIRMED CLOUD VALUE
        // ------------------------------------------

        currentWeld.sharedStatus =
            confirmedStatus;

        currentWeld.psetVersion =
            getPsetVersion(
                confirmedPset
            );

        currentWeld.schemaVersion =
            getSchemaVersion(
                confirmedPset
            );

        await applyColour(
            confirmedStatus
        );

        message.innerHTML =
            "<strong>" +
            "Status saved to Trimble." +
            "</strong>" +
            "<br>" +
            escapeHtml(
                confirmedStatus
            ) +
            " is now the shared project value.";

        message.style.color =
            "#006b3c";


        // ------------------------------------------
        // REFRESH PANEL AFTER SUCCESS
        // ------------------------------------------

        setTimeout(
            function() {

                renderPanel();

                const refreshedMessage =
                    document.getElementById(
                        "saveMessage"
                    );

                if (refreshedMessage) {

                    refreshedMessage.innerHTML =
                        "<strong>" +
                        "Shared status confirmed: " +
                        escapeHtml(
                            confirmedStatus
                        ) +
                        "</strong>";

                    refreshedMessage.style.color =
                        "#006b3c";
                }
            },

            250
        );


    } catch (error) {

        console.error(
            "SAVE STATUS FAILED:",
            error
        );

        message.innerHTML =
            "<strong>Shared save failed.</strong>" +
            "<br>" +
            escapeHtml(
                error &&
                error.message
                    ? error.message
                    : String(error)
            );

        message.style.color =
            "#b42318";

    } finally {

        button.disabled =
            false;

        button.textContent =
            "SAVE WELD STATUS";
    }
}


// --------------------------------------------------
// READ API RESPONSE
// --------------------------------------------------

async function readResponseData(response) {

    const text =
        await response.text();

    if (!text) {

        return {};
    }

    try {

        return JSON.parse(
            text
        );

    } catch (error) {

        return text;
    }
}


// --------------------------------------------------
// WAIT
// --------------------------------------------------

function wait(milliseconds) {

    return new Promise(
        function(resolve) {

            setTimeout(
                resolve,
                milliseconds
            );
        }
    );
}


// --------------------------------------------------
// SAFE JSON
// --------------------------------------------------

function safeJson(value) {

    try {

        return JSON.stringify(
            value,

            function(key, item) {

                if (
                    typeof item === "bigint"
                ) {

                    return item.toString();
                }

                return item;
            },

            2
        );

    } catch (error) {

        return String(value);
    }
}


// --------------------------------------------------
// DISPLAY FIELD
// --------------------------------------------------

function field(
    label,
    value
) {

    if (!value) {

        return "";
    }

    return (
        "<div style=\"margin-bottom:10px;\">" +

        "<small>" +
        escapeHtml(
            label.toUpperCase()
        ) +
        "</small>" +

        "<br>" +

        "<strong>" +
        escapeHtml(value) +
        "</strong>" +

        "</div>"
    );
}


// --------------------------------------------------
// UNIT
// --------------------------------------------------

function withMM(value) {

    if (!value) {

        return "";
    }

    const text =
        String(value);

    if (
        text
            .toLowerCase()
            .includes("mm")
    ) {

        return text;
    }

    return text + " mm";
}


// --------------------------------------------------
// HTML SAFETY
// --------------------------------------------------

function escapeHtml(value) {

    return String(
        value === null ||
        value === undefined
            ? ""
            : value
    )
        .replaceAll(
            "&",
            "&amp;"
        )
        .replaceAll(
            "<",
            "&lt;"
        )
        .replaceAll(
            ">",
            "&gt;"
        )
        .replaceAll(
            "\"",
            "&quot;"
        )
        .replaceAll(
            "'",
            "&#039;"
        );
}


// --------------------------------------------------
// ERROR
// --------------------------------------------------

function showError(error) {

    console.error(error);

    document
        .getElementById("status")
        .innerHTML =

        "<strong>Error</strong>" +
        "<br><br>" +

        escapeHtml(
            error &&
            error.message
                ? error.message
                : String(error)
        );
}


// --------------------------------------------------
// GO
// --------------------------------------------------

window.addEventListener(
    "load",
    start
);
