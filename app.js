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

async function start() {
    const statusBox =
        document.getElementById("status");

    try {
        statusBox.innerHTML =
            "Connecting to Trimble Connect...";

        API = await TrimbleConnectWorkspace.connect(
            window.parent,
            onEvent
        );

        statusBox.innerHTML =
            "<strong>Connected to Trimble Connect</strong><br><br>" +
            "Checking permission for shared project data...";

        try {
            const accessToken =
                await API.extension.requestPermission(
                    "accesstoken"
                );

            if (
                accessToken &&
                typeof accessToken === "string"
            ) {
                window.trimbleAccessToken =
                    accessToken;

                console.log(
                    "Trimble access token received successfully."
                );

                statusBox.innerHTML =
                    "<strong>Connected to Trimble Connect</strong><br>" +
                    "<strong>Shared-data permission granted</strong>" +
                    "<br><br>" +
                    "Select one weld in the 3D model.";
            } else {
                console.warn(
                    "Permission response received, but no token was returned."
                );

                statusBox.innerHTML =
                    "<strong>Connected to Trimble Connect</strong><br>" +
                    "<strong>Shared-data permission not yet available</strong>" +
                    "<br><br>" +
                    "Local weld tracking still works. " +
                    "Select one weld in the model.";
            }

        } catch (permissionError) {
            console.error(
                "Access-token permission failed:",
                permissionError
            );

            statusBox.innerHTML =
                "<strong>Connected to Trimble Connect</strong><br>" +
                "<strong>Shared-data permission failed</strong>" +
                "<br><br>" +
                escapeHtml(
                    permissionError?.message ||
                    String(permissionError)
                ) +
                "<br><br>" +
                "Local weld tracking is still available.";
        }

    } catch (error) {
        showError(error);
    }
}

async function onEvent(event, data) {
    console.log("Trimble event:", event, data);

    if (
        event === "viewer.onSelectionChanged" ||
        event === "selectionChanged"
    ) {
        await readWeld();
    }
}

async function readWeld() {
    try {
        const selection = await API.viewer.getSelection();

        if (!selection || selection.length === 0) {
            currentWeld = null;

            document.getElementById("status").innerHTML =
                "Select one weld in the model.";

            return;
        }

        const selected = selection[0];

        if (
            !selected.objectRuntimeIds ||
            selected.objectRuntimeIds.length === 0
        ) {
            return;
        }

        const modelId = selected.modelId;
        const runtimeId = selected.objectRuntimeIds[0];

        const properties =
            await API.viewer.getObjectProperties(
                modelId,
                [runtimeId]
            );

        let externalId = modelId + "-" + runtimeId;

        try {
            const ids =
                await API.viewer.convertToObjectIds(
                    modelId,
                    [runtimeId]
                );

            if (ids && ids.length) {
                externalId = String(ids[0]);
            }
        } catch (error) {
            console.warn("GUID unavailable:", error);
        }

        const flat = {};
        flatten(properties, flat);

        currentWeld = {
            modelId,
            runtimeId,
            externalId,

            weldId: getProp(flat, [
                "weld id",
                "weld number"
            ]),

            type: getProp(flat, [
                "weld type"
            ]),

            purpose: getProp(flat, [
                "weld purpose"
            ]),

            length: getProp(flat, [
                "weld length (mm)",
                "weld length"
            ]),

            throat: getProp(flat, [
                "weld throat (mm)",
                "weld throat"
            ]),

            cage: getProp(flat, [
                "weld cage id",
                "embed cage id"
            ]),

            detail: getProp(flat, [
                "detail"
            ]),

            father: getProp(flat, [
                "father id"
            ])
        };

        renderPanel();

    } catch (error) {
        showError(error);
    }
}

function flatten(value, output) {
    if (value === null || value === undefined) return;

    if (Array.isArray(value)) {
        value.forEach(x => flatten(x, output));
        return;
    }

    if (typeof value !== "object") return;

    if (
        value.name !== undefined &&
        value.value !== undefined
    ) {
        output[String(value.name).toLowerCase()] =
            safeValue(value.value);
    }

    if (
        value.key !== undefined &&
        value.value !== undefined
    ) {
        output[String(value.key).toLowerCase()] =
            safeValue(value.value);
    }

    Object.entries(value).forEach(([key, item]) => {
        if (
            item !== null &&
            item !== undefined &&
            typeof item !== "object"
        ) {
            output[key.toLowerCase()] =
                safeValue(item);
        }

        flatten(item, output);
    });
}

function safeValue(value) {
    if (typeof value === "bigint") {
        return value.toString();
    }

    return String(value ?? "");
}

function getProp(flat, names) {
    for (const name of names) {
        if (flat[name]) return flat[name];
    }

    for (const [key, value] of Object.entries(flat)) {
        for (const name of names) {
            if (key.includes(name) && value) {
                return value;
            }
        }
    }

    return "";
}

async function applyColour(status) {
    if (!API || !currentWeld) return;

    const selector = {
        modelObjectIds: [{
            modelId: currentWeld.modelId,
            objectRuntimeIds: [currentWeld.runtimeId]
        }]
    };

    await API.viewer.setObjectState(
        selector,
        {
            color: statuses[status],
            visible: true
        }
    );
}

function renderPanel() {
    const key =
        "weld-status-" + currentWeld.externalId;

    const saved =
        JSON.parse(
            localStorage.getItem(key) || "null"
        );

    const currentStatus =
        saved?.status || "Not Started";

    const colour =
        statuses[currentStatus];

    applyColour(currentStatus).catch(console.error);

    const options =
        Object.keys(statuses)
            .map(status =>
                `<option
                    value="${escapeHtml(status)}"
                    ${status === currentStatus ? "selected" : ""}
                >
                    ${escapeHtml(status)}
                </option>`
            )
            .join("");

    document.getElementById("status").innerHTML = `
        <div style="
            border-left:8px solid ${colour};
            padding-left:12px;
        ">

            <small>WELD ID</small>

            <div style="
                font-size:24px;
                font-weight:bold;
                margin-bottom:16px;
            ">
                ${escapeHtml(currentWeld.weldId)}
            </div>

            ${field("Type", currentWeld.type)}
            ${field("Purpose", currentWeld.purpose)}
            ${field("Length", withMM(currentWeld.length))}
            ${field("Throat", withMM(currentWeld.throat))}
            ${field("Cage", currentWeld.cage)}
            ${field("Detail", currentWeld.detail)}
            ${field("Father ID", currentWeld.father)}

            <hr>

            <strong>Weld status</strong>

            <select
                id="weldStatusSelect"
                style="
                    width:100%;
                    padding:9px;
                    margin:8px 0 12px 0;
                "
            >
                ${options}
            </select>

            <strong>Comment</strong>

            <textarea
                id="statusComment"
                rows="3"
                style="
                    width:100%;
                    box-sizing:border-box;
                    margin-top:8px;
                "
            >${escapeHtml(saved?.comment || "")}</textarea>

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
                style="margin-top:10px;"
            ></div>

            <details style="margin-top:15px;">
                <summary>
                    Technical object information
                </summary>

                <br>

                <strong>Model ID</strong><br>
                ${escapeHtml(currentWeld.modelId)}

                <br><br>

                <strong>External ID / GUID</strong><br>
                ${escapeHtml(currentWeld.externalId)}
            </details>

        </div>
    `;

    document
        .getElementById("saveButton")
        .addEventListener("click", saveStatus);
}

async function saveStatus() {
    const status =
        document.getElementById(
            "weldStatusSelect"
        ).value;

    const comment =
        document.getElementById(
            "statusComment"
        ).value.trim();

    const record = {
        weldId: currentWeld.weldId,
        externalId: currentWeld.externalId,
        status,
        comment,
        updatedAt: new Date().toISOString()
    };

    localStorage.setItem(
        "weld-status-" + currentWeld.externalId,
        JSON.stringify(record)
    );

    try {
        await applyColour(status);
    } catch (error) {
        console.error(
            "Colour error:",
            error
        );
    }

    renderPanel();

    const message =
        document.getElementById("saveMessage");

    message.innerHTML =
        "<strong>Status saved.</strong>";

    message.style.color = "#006b3c";
}

function field(label, value) {
    if (!value) return "";

    return `
        <div style="margin-bottom:10px;">
            <small>${escapeHtml(label.toUpperCase())}</small>
            <br>
            <strong>${escapeHtml(value)}</strong>
        </div>
    `;
}

function withMM(value) {
    if (!value) return "";

    return String(value)
        .toLowerCase()
        .includes("mm")
            ? value
            : value + " mm";
}

function escapeHtml(value) {
    return String(value ?? "")
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll("\"", "&quot;")
        .replaceAll("'", "&#039;");
}

function showError(error) {
    console.error(error);

    document.getElementById("status").innerHTML =
        "<strong>Error</strong><br><br>" +
        escapeHtml(
            error?.message || String(error)
        );
}

window.addEventListener(
    "load",
    start
);
