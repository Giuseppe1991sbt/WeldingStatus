let API = null;
let currentWeld = null;

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

    const box = document.getElementById("status");

    try {

        box.innerHTML =
            "Connecting to Trimble Connect...";

        API = await TrimbleConnectWorkspace.connect(
            window.parent,
            onEvent
        );

        box.innerHTML =
            "Connected. Requesting Trimble permission...";

        // ------------------------------------------
        // GET CURRENT PROJECT
        // ------------------------------------------

        const project =
            await API.project.getProject();

        console.log(
            "CURRENT TRIMBLE PROJECT:",
            project
        );

        // ------------------------------------------
        // REQUEST TRIMBLE ACCESS TOKEN
        // ------------------------------------------

        const token =
            await API.extension.requestPermission(
                "accesstoken"
            );

        console.log(
            "ACCESS TOKEN RECEIVED:",
            Boolean(token)
        );

        console.log(
            "ACCESS TOKEN TYPE:",
            typeof token
        );

        console.log(
            "ACCESS TOKEN LENGTH:",
            typeof token === "string"
                ? token.length
                : "Not a string"
        );

        if (!token) {

            throw new Error(
                "Trimble Connect did not return an access token."
            );
        }

        window.trimbleAccessToken =
            token;

        // ------------------------------------------
        // CONNECTION TEST SUCCESSFUL
        // ------------------------------------------

        box.innerHTML = `

            <strong style="color:#006b3c;">
                Trimble connection successful
            </strong>

            <br><br>

            <strong>Project name:</strong>
            <br>
            ${escapeHtml(
                project?.name ||
                "Not returned"
            )}

            <br><br>

            <strong>Project ID:</strong>
            <br>
            ${escapeHtml(
                project?.id ||
                project?.projectId ||
                "Not returned"
            )}

            <br><br>

            <strong>Access token:</strong>
            <br>
            ${
                token
                    ? "RECEIVED"
                    : "NOT RECEIVED"
            }

            <br><br>

            Select one weld in the 3D model.
        `;

    } catch (error) {

        console.error(
            "START-UP TEST FAILED:",
            error
        );

        showError(error);
    }
}


// --------------------------------------------------
// TRIMBLE EVENTS
// --------------------------------------------------

async function onEvent(event, data) {

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

            document.getElementById("status")
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


        const result =
            await API.viewer.getObjectProperties(
                modelId,
                [runtimeId]
            );


        console.log(
            "RAW TRIMBLE PROPERTIES:",
            result
        );


        // ------------------------------------------
        // GET NORMAL MODEL PROPERTIES
        // ------------------------------------------

        const flat = {};

        flatten(
            result,
            flat
        );


        // ------------------------------------------
        // FIND WELD PROGRESS PROPERTY SET
        // ------------------------------------------

        const weldProgress =
            findPropertySet(
                result,
                "Weld Progress"
            );


        console.log(
            "WELD PROGRESS FOUND:",
            weldProgress
        );


        let sharedStatus = "";
        let sharedComment = "";


        if (weldProgress) {

            sharedStatus =
                readPropertyFromSet(
                    weldProgress,
                    "Weld Status"
                );


            sharedComment =
                readPropertyFromSet(
                    weldProgress,
                    "Status Comment"
                );
        }


        console.log(
            "SHARED STATUS:",
            sharedStatus
        );


        // ------------------------------------------
        // GET GUID
        // ------------------------------------------

        let externalId =
            modelId + "-" + runtimeId;


        try {

            const ids =
                await API.viewer.convertToObjectIds(
                    modelId,
                    [runtimeId]
                );


            if (
                ids &&
                ids.length > 0
            ) {

                externalId =
                    String(ids[0]);
            }

        } catch (error) {

            console.warn(
                "Could not get GUID:",
                error
            );
        }


        // ------------------------------------------
        // BUILD CURRENT WELD OBJECT
        // ------------------------------------------

        currentWeld = {

            modelId:
                modelId,

            runtimeId:
                runtimeId,

            externalId:
                externalId,


            weldId: getProp(
                flat,
                [
                    "weld id",
                    "weld number"
                ]
            ),


            type: getProp(
                flat,
                [
                    "weld type"
                ]
            ),


            purpose: getProp(
                flat,
                [
                    "weld purpose"
                ]
            ),


            length: getProp(
                flat,
                [
                    "weld length (mm)",
                    "weld length"
                ]
            ),


            throat: getProp(
                flat,
                [
                    "weld throat (mm)",
                    "weld throat"
                ]
            ),


            cage: getProp(
                flat,
                [
                    "weld cage id",
                    "embed cage id"
                ]
            ),


            detail: getProp(
                flat,
                [
                    "detail"
                ]
            ),


            father: getProp(
                flat,
                [
                    "father id"
                ]
            ),


            sharedStatus:
                sharedStatus,


            sharedComment:
                sharedComment
        };


        renderPanel();

    } catch (error) {

        showError(error);
    }
}


// --------------------------------------------------
// FIND A SPECIFIC PROPERTY SET
// --------------------------------------------------

function findPropertySet(
    input,
    wantedName
) {

    if (
        input === null ||
        input === undefined
    ) {
        return null;
    }


    if (Array.isArray(input)) {

        for (const item of input) {

            const found =
                findPropertySet(
                    item,
                    wantedName
                );

            if (found) {
                return found;
            }
        }

        return null;
    }


    if (
        typeof input !== "object"
    ) {
        return null;
    }


    if (
        typeof input.name === "string" &&
        input.name
            .trim()
            .toLowerCase() ===
        wantedName
            .trim()
            .toLowerCase() &&
        Array.isArray(input.properties)
    ) {

        return input;
    }


    for (
        const value
        of Object.values(input)
    ) {

        const found =
            findPropertySet(
                value,
                wantedName
            );

        if (found) {
            return found;
        }
    }


    return null;
}


// --------------------------------------------------
// READ PROPERTY FROM PROPERTY SET
// --------------------------------------------------

function readPropertyFromSet(
    propertySet,
    wantedName
) {

    if (
        !propertySet ||
        !Array.isArray(
            propertySet.properties
        )
    ) {

        return "";
    }


    const wanted =
        wantedName
            .trim()
            .toLowerCase();


    for (
        const property
        of propertySet.properties
    ) {

        if (
            property &&
            typeof property.name === "string" &&
            property.name
                .trim()
                .toLowerCase() ===
            wanted
        ) {

            return safeValue(
                property.value
            );
        }
    }


    return "";
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
            item =>
                flatten(
                    item,
                    output
                )
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
            ([key, value]) => {

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
        const [key, value]
        of Object.entries(flat)
    ) {

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

    const localKey =
        "weld-status-" +
        currentWeld.externalId;


    const localRecord =
        JSON.parse(
            localStorage.getItem(
                localKey
            ) || "null"
        );


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
            : localRecord?.status ||
              "Not Started";


    const currentComment =
        currentWeld.sharedComment ||
        localRecord?.comment ||
        "";


    const source =
        sharedValid
            ? "Shared Trimble property"
            : "Local browser prototype";


    const colour =
        statuses[currentStatus];


    applyColour(
        currentStatus
    ).catch(
        error =>
            console.error(
                "Colour error:",
                error
            )
    );


    const options =
        Object.keys(statuses)
            .map(
                status => {

                    const selected =
                        status === currentStatus
                            ? "selected"
                            : "";

                    return `
                        <option
                            value="${escapeHtml(status)}"
                            ${selected}
                        >
                            ${escapeHtml(status)}
                        </option>
                    `;
                }
            )
            .join("");


    document.getElementById("status")
        .innerHTML = `

        <div style="
            border-left:8px solid ${colour};
            padding-left:12px;
        ">

            <small>
                WELD ID
            </small>

            <div style="
                font-size:24px;
                font-weight:bold;
                margin-bottom:16px;
            ">
                ${escapeHtml(
                    currentWeld.weldId
                )}
            </div>


            ${field(
                "Type",
                currentWeld.type
            )}

            ${field(
                "Purpose",
                currentWeld.purpose
            )}

            ${field(
                "Length",
                withMM(
                    currentWeld.length
                )
            )}

            ${field(
                "Throat",
                withMM(
                    currentWeld.throat
                )
            )}

            ${field(
                "Cage",
                currentWeld.cage
            )}

            ${field(
                "Detail",
                currentWeld.detail
            )}

            ${field(
                "Father ID",
                currentWeld.father
            )}


            <hr>


            <strong>
                Weld status
            </strong>


            <div style="
                font-size:11px;
                color:${
                    sharedValid
                        ? "#006b3c"
                        : "#666"
                };
                margin-top:4px;
                margin-bottom:8px;
            ">

                Source:
                <strong>
                    ${escapeHtml(source)}
                </strong>

            </div>


            <select
                id="weldStatusSelect"
                style="
                    width:100%;
                    padding:9px;
                    margin-bottom:12px;
                "
            >

                ${options}

            </select>


            <strong>
                Comment
            </strong>


            <textarea
                id="statusComment"
                rows="3"
                style="
                    width:100%;
                    box-sizing:border-box;
                    margin-top:8px;
                "
            >${escapeHtml(
                currentComment
            )}</textarea>


            <button
                id="saveButton"
                style="
                    width:100%;
                    margin-top:12px;
                    padding:11px;
                    background:#0063a6;
                    color:white;
                    border:none;
                    border-radius:4px;
                    font-weight:bold;
                    cursor:pointer;
                "
            >

                SAVE WELD STATUS

            </button>


            <div
                id="saveMessage"
                style="
                    margin-top:10px;
                "
            >
            </div>


            <details
                style="
                    margin-top:15px;
                "
            >

                <summary>
                    Technical object information
                </summary>


                <br>


                <strong>
                    Model ID
                </strong>

                <br>

                ${escapeHtml(
                    currentWeld.modelId
                )}


                <br><br>


                <strong>
                    External ID / GUID
                </strong>

                <br>

                ${escapeHtml(
                    currentWeld.externalId
                )}


                <br><br>


                <strong>
                    Weld Progress detected
                </strong>

                <br>

                ${
                    sharedValid
                        ? "YES"
                        : "NO"
                }


                <br><br>


                <strong>
                    Shared Weld Status
                </strong>

                <br>

                ${escapeHtml(
                    currentWeld.sharedStatus ||
                    "Not detected"
                )}

            </details>

        </div>
    `;


    document
        .getElementById(
            "saveButton"
        )
        .addEventListener(
            "click",
            saveStatus
        );
}


// --------------------------------------------------
// SAVE
//
// STILL LOCAL WRITE FOR THIS TEST.
// --------------------------------------------------

async function saveStatus() {

    const status =
        document
            .getElementById(
                "weldStatusSelect"
            )
            .value;


    const comment =
        document
            .getElementById(
                "statusComment"
            )
            .value
            .trim();


    const record = {

        weldId:
            currentWeld.weldId,

        externalId:
            currentWeld.externalId,

        status:
            status,

        comment:
            comment,

        updatedAt:
            new Date()
                .toISOString()
    };


    localStorage.setItem(

        "weld-status-" +
        currentWeld.externalId,

        JSON.stringify(
            record
        )
    );


    await applyColour(
        status
    );


    const message =
        document.getElementById(
            "saveMessage"
        );


    message.innerHTML =
        "<strong>Status saved locally.</strong><br>" +
        "Shared Trimble write comes next.";


    message.style.color =
        "#006b3c";
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


    return `

        <div style="
            margin-bottom:10px;
        ">

            <small>
                ${escapeHtml(
                    label.toUpperCase()
                )}
            </small>

            <br>

            <strong>
                ${escapeHtml(value)}
            </strong>

        </div>
    `;
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


    return (
        text +
        " mm"
    );
}


// --------------------------------------------------
// HTML SAFETY
// --------------------------------------------------

function escapeHtml(value) {

    return String(
        value ?? ""
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


    document.getElementById("status")
        .innerHTML =

        "<strong>Error</strong>" +
        "<br><br>" +

        escapeHtml(
            error?.message ||
            String(error)
        );
}


// --------------------------------------------------
// GO
// --------------------------------------------------

window.addEventListener(
    "load",
    start
);
