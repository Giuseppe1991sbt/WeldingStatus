let API = null;
let currentWeld = null;

const weldStatuses = [
    "Not Started",
    "Part Completed",
    "Weld Complete",
    "VT/PT Inspection Completed",
    "NDT Passed",
    "NDT Failed / Remedial Works Required",
    "Fully Complete / Closed Out"
];

const statusColours = {
    "Not Started": "#808080",
    "Part Completed": "#f4c542",
    "Weld Complete": "#2684ff",
    "VT/PT Inspection Completed": "#8e44ad",
    "NDT Passed": "#2e9d50",
    "NDT Failed / Remedial Works Required": "#d32f2f",
    "Fully Complete / Closed Out": "#006b3c"
};


async function startTrimbleConnection() {

    const statusBox = document.getElementById("status");

    try {

        statusBox.innerHTML = "Connecting to Trimble Connect...";

        API = await TrimbleConnectWorkspace.connect(
            window.parent,
            onTrimbleEvent
        );

        statusBox.innerHTML =
            "<strong>Connected to Trimble Connect</strong><br><br>" +
            "Select one weld in the 3D model.";

    } catch (error) {

        showError("Connection failed", error);
    }
}


async function onTrimbleEvent(event, data) {

    console.log("Trimble event:", event, data);

    if (
        event === "viewer.onSelectionChanged" ||
        event === "selectionChanged"
    ) {
        await readSelectedObject();
    }
}


async function readSelectedObject() {

    const statusBox = document.getElementById("status");

    try {

        const selection = await API.viewer.getSelection();

        if (!selection || selection.length === 0) {

            currentWeld = null;

            statusBox.innerHTML =
                "<strong>No weld selected</strong><br><br>" +
                "Select one weld in the model.";

            return;
        }

        if (selection.length > 1) {

            currentWeld = null;

            statusBox.innerHTML =
                "<strong>Multiple objects selected</strong><br><br>" +
                "Please select one weld only.";

            return;
        }

        const selected = selection[0];
        const modelId = selected.modelId;
        const runtimeIds = selected.objectRuntimeIds;

        if (!runtimeIds || runtimeIds.length === 0) {

            currentWeld = null;
            statusBox.innerHTML = "No weld selected.";
            return;
        }

        const properties =
            await API.viewer.getObjectProperties(
                modelId,
                runtimeIds
            );

        let externalIds = [];

        try {

            externalIds =
                await API.viewer.convertToObjectIds(
                    modelId,
                    runtimeIds
                );

        } catch (conversionError) {

            console.warn(
                "External ID conversion failed:",
                conversionError
            );
        }

        const flatProperties = {};

        flattenProperties(
            properties,
            flatProperties
        );

        console.log(
            "Flattened weld properties:",
            flatProperties
        );

        const externalId =
            externalIds.length > 0
                ? String(externalIds[0])
                : modelId + "-" + String(runtimeIds[0]);

        currentWeld = {
            modelId: modelId,
            runtimeId: runtimeIds[0],
            externalId: externalId,

            weldId: findProperty(
                flatProperties,
                ["Weld ID", "Weld Id", "Weld Number"]
            ),

            purpose: findProperty(
                flatProperties,
                ["Weld Purpose"]
            ),

            type: findProperty(
                flatProperties,
                ["Weld Type"]
            ),

            length: findProperty(
                flatProperties,
                ["Weld Length (mm)", "Weld Length"]
            ),

            throat: findProperty(
                flatProperties,
                ["Weld Throat (mm)", "Weld Throat"]
            ),

            cageId: findProperty(
                flatProperties,
                ["Weld Cage Id", "Weld Cage ID", "Embed Cage Id"]
            ),

            fatherId: findProperty(
                flatProperties,
                ["Father ID", "Father Id"]
            ),

            detail: findProperty(
                flatProperties,
                ["Detail"]
            )
        };

        renderWeldPanel();

    } catch (error) {

        showError("Error reading weld", error);
    }
}


function flattenProperties(input, output) {

    if (input === null || input === undefined) {
        return;
    }

    if (Array.isArray(input)) {

        input.forEach(item =>
            flattenProperties(item, output)
        );

        return;
    }

    if (typeof input !== "object") {
        return;
    }

    if (
        input.name !== undefined &&
        input.value !== undefined
    ) {
        output[
            String(input.name).trim().toLowerCase()
        ] = normaliseValue(input.value);
    }

    if (
        input.key !== undefined &&
        input.value !== undefined
    ) {
        output[
            String(input.key).trim().toLowerCase()
        ] = normaliseValue(input.value);
    }

    Object.entries(input).forEach(
        ([key, value]) => {

            if (
                value !== null &&
                value !== undefined &&
                typeof value !== "object"
            ) {
                output[
                    String(key).trim().toLowerCase()
                ] = normaliseValue(value);
            }

            flattenProperties(value, output);
        }
    );
}


function normaliseValue(value) {

    if (typeof value === "bigint") {
        return value.toString();
    }

    if (
        typeof value === "string" ||
        typeof value === "number" ||
        typeof value === "boolean"
    ) {
        return String(value);
    }

    return "";
}


function findProperty(flatProperties, possibleNames) {

    for (const name of possibleNames) {

        const exactKey = name.toLowerCase();

        if (
            flatProperties[exactKey] !== undefined &&
            flatProperties[exactKey] !== ""
        ) {
            return flatProperties[exactKey];
        }
    }

    for (const [key, value] of Object.entries(flatProperties)) {

        for (const name of possibleNames) {

            const searchName = name.toLowerCase();

            if (
                key.includes(searchName) &&
                value !== ""
            ) {
                return value;
            }
        }
    }

    return "Not available";
}


function renderWeldPanel() {

    const statusBox = document.getElementById("status");

    const storageKey =
        "weld-status-" + currentWeld.externalId;

    const savedRecord =
        JSON.parse(
            localStorage.getItem(storageKey) || "null"
        );

    const selectedStatus =
        savedRecord?.status || "Not Started";

    const colour =
        statusColours[selectedStatus] || "#808080";

    const options = weldStatuses
        .map(status => {

            const selected =
                status === selectedStatus
                    ? "selected"
                    : "";

            return (
                "<option value=\"" +
                escapeHtml(status) +
                "\" " +
                selected +
                ">" +
                escapeHtml(status) +
                "</option>"
            );
        })
        .join("");

    statusBox.innerHTML = `
        <div style="
            border-left: 8px solid ${colour};
            padding-left: 12px;
        ">

            <div style="
                font-size: 13px;
                color: #666;
                margin-bottom: 3px;
            ">
                WELD ID
            </div>

            <div style="
                font-size: 24px;
                font-weight: bold;
                margin-bottom: 16px;
            ">
                ${escapeHtml(currentWeld.weldId)}
            </div>

            ${createField("Type", currentWeld.type)}
            ${createField("Purpose", currentWeld.purpose)}
            ${createField("Length", addUnit(currentWeld.length, "mm"))}
            ${createField("Throat", addUnit(currentWeld.throat, "mm"))}
            ${createField("Cage", currentWeld.cageId)}
            ${createField("Detail", currentWeld.detail)}
            ${createField("Father ID", currentWeld.fatherId)}

            <hr style="
                border: 0;
                border-top: 1px solid #ccc;
                margin: 18px 0;
            ">

            <label
                for="weldStatusSelect"
                style="
                    display: block;
                    font-weight: bold;
                    margin-bottom: 7px;
                "
            >
                Weld status
            </label>

            <select
                id="weldStatusSelect"
                style="
                    width: 100%;
                    padding: 10px;
                    border: 1px solid #999;
                    border-radius: 4px;
                    margin-bottom: 12px;
                    background: white;
                "
            >
                ${options}
            </select>

            <label
                for="statusComment"
                style="
                    display: block;
                    font-weight: bold;
                    margin-bottom: 7px;
                "
            >
                Comment
            </label>

            <textarea
                id="statusComment"
                rows="3"
                placeholder="Optional status comment"
                style="
                    width: 100%;
                    box-sizing: border-box;
                    padding: 8px;
                    border: 1px solid #999;
                    border-radius: 4px;
                    margin-bottom: 12px;
                    resize: vertical;
                "
            >${escapeHtml(savedRecord?.comment || "")}</textarea>

            <button
                id="saveStatusButton"
                style="
                    width: 100%;
                    padding: 11px;
                    color: white;
                    background: #0063a6;
                    border: 0;
                    border-radius: 4px;
                    font-weight: bold;
                    cursor: pointer;
                "
            >
                SAVE WELD STATUS
            </button>

            <div
                id="saveMessage"
                style="
                    margin-top: 12px;
                    font-size: 13px;
                "
            ></div>

            <details style="margin-top: 16px;">

                <summary style="cursor: pointer;">
                    Technical object information
                </summary>

                <div style="
                    margin-top: 8px;
                    font-size: 12px;
                    word-break: break-all;
                ">
                    <strong>Model ID:</strong><br>
                    ${escapeHtml(currentWeld.modelId)}
                    <br><br>

                    <strong>External ID / GUID:</strong><br>
                    ${escapeHtml(currentWeld.externalId)}
                </div>

            </details>

        </div>
    `;

    document
        .getElementById("saveStatusButton")
        .addEventListener(
            "click",
            saveWeldStatus
        );
}


function saveWeldStatus() {

    if (!currentWeld) {
        return;
    }

    const selectedStatus =
        document
            .getElementById("weldStatusSelect")
            .value;

    const comment =
        document
            .getElementById("statusComment")
            .value
            .trim();

    const record = {
        weldId: currentWeld.weldId,
        externalId: currentWeld.externalId,
        status: selectedStatus,
        comment: comment,
        updatedAt: new Date().toISOString()
    };

    const storageKey =
        "weld-status-" + currentWeld.externalId;

    localStorage.setItem(
        storageKey,
        JSON.stringify(record)
    );

    renderWeldPanel();

    const message =
        document.getElementById("saveMessage");

    message.innerHTML =
        "<strong>Status saved for this prototype.</strong><br>" +
        "The status is currently stored only in this browser.";

    message.style.color = "#006b3c";
}


function createField(label, value) {

    if (
        value === undefined ||
        value === null ||
        value === "" ||
        value === "Not available"
    ) {
        return "";
    }

    return `
        <div style="margin-bottom: 10px;">

            <div style="
                font-size: 11px;
                color: #666;
                text-transform: uppercase;
            ">
                ${escapeHtml(label)}
            </div>

            <div style="font-weight: 600;">
                ${escapeHtml(value)}
            </div>

        </div>
    `;
}


function addUnit(value, unit) {

    if (
        value === undefined ||
        value === null ||
        value === "" ||
        value === "Not available"
    ) {
        return value;
    }

    const text = String(value);

    if (
        text.toLowerCase().includes(
            unit.toLowerCase()
        )
    ) {
        return text;
    }

    return text + " " + unit;
}


function escapeHtml(value) {

    return String(value ?? "")
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll("\"", "&quot;")
        .replaceAll("'", "&#039;");
}


function showError(title, error) {

    console.error(error);

    const message =
        error && error.message
            ? error.message
            : String(error);

    document.getElementById("status").innerHTML =
        "<strong>" +
        escapeHtml(title) +
        "</strong><br><br>" +
        escapeHtml(message);
}


window.addEventListener(
    "load",
    startTrimbleConnection
);
