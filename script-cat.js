// ==UserScript==
// @name         Export LDS Directory
// @namespace    https://docs.scriptcat.org/
// @version      0.1.0
// @description  Export LDS Directory
// @author       Michael Becker
// @match        https://directory.churchofjesuschrist.org/*
// @grant        GM_setValue
// @grant        GM_addValueChangeListener
// @grant        GM_removeValueChangeListener
// @grant        GM_xmlhttpRequest
// @noframes
// ==/UserScript==


// plug this into ScriptCat


(async () => {
    'use strict';
    const unitId = location.pathname.split('/').at(-1);
    let json;
    try {
        const res = await fetch(`/api/v4/households?unit=${unitId}`);
        json = await res.json();
    } catch(err) {
        const msg = err.message ? `: ${err.message}` : '.';
        showToast(`Error getting directory: ${msg}`, 'error');
        console.error(err);
        return;
    }
    console.log('Captured Church Directory:', json);
    try {
        await new Promise((resolve, reject) =>
            GM_xmlhttpRequest({
                method: 'POST',
                url: 'https://executive-secretary-portal.m1-g2-becker3.workers.dev/api/persons/data',
                data: JSON.stringify(json),
                headers: {
                    'X-App-Password': '<PASSWORD-HERE>'
                },
                onload: (res) => resolve(res),
                onerror: (err) => reject(err)
            })
        );
    } catch(err) {
        const msg = err.message ? `: ${err.message}` : '.';
        showToast(`Error exporting directory: ${msg}`, 'error');
        console.error(err);
        return;
    }

    showToast('Ward directory captured to ES-Portal.');
})();

const safeFetch = (url, options={}) => new Promise((resolve, reject) => {
    const uuid = crypto.randomUUID();
    GM_setValue('fetch', null);
    const listenerId = GM_addValueChangeListener('fetch_res', (name, oldValue, res) => {
        if (typeof res !== 'object' || res === null) return;
        if (res.uuid !== uuid) return;
        GM_removeValueChangeListener(listenerId);

        if (res.error)
            reject(res.error);
        else
            resolve(res.data);
    });
    GM_setValue('fetch', {
        uuid, 
        url,
        options
    });
});

function showToast(message, type = 'info', duration = 3000) {
    // 1. Create or find the toast container
    let container = document.getElementById('toast-container');
    if (!container) {
        container = document.createElement('div');
        container.id = 'toast-container';

        // Style the container via JS
        Object.assign(container.style, {
            position: 'fixed',
            bottom: '20px',
            right: '20px',
            zIndex: '9999',
            display: 'flex',
            flexDirection: 'column',
            gap: '10px',
            maxWidth: '400px'
        });
        document.body.appendChild(container);
    }

    // 2. Create the toast element
    const toast = document.createElement('div');
    toast.textContent = message;

    // Set colors based on type
    let bgColor = '#007DA5';
    if (type === 'success') bgColor = '#28a745';
    if (type === 'error') bgColor = '#dc3545';
    if (type === 'warning') bgColor = '#ffc107';

    // Style the individual toast
    Object.assign(toast.style, {
        backgroundColor: bgColor,
        color: '#fff',
        padding: '12px 16px',
        borderRadius: '4px',
        fontSize: '14px',
        boxShadow: '0 4px 6px rgba(0,0,0,0.1)',
        opacity: '0',
        transform: 'translateY(50%)',
        transition: 'opacity 0.3s ease-in-out, transform 0.3s ease-in-out',
        cursor: 'pointer'
    });

    // 3. Append and animate in
    container.appendChild(toast);
    setTimeout(() => {
        toast.style.opacity = '1';
        toast.style.transform = '';
    }, 10);

    // 4. Remove on click or timeout
    const remove = () => {
        toast.style.opacity = '0';
        toast.style.transform = 'translateY(-50%)';
        setTimeout(() => toast.remove(), 300);
    };

    toast.addEventListener('click', remove);
    setTimeout(remove, duration);
}