// Event listener for form submission
document.getElementById('repoForm').addEventListener('submit', async function (e) {
    e.preventDefault();
    const repoUrl = document.getElementById('repoUrl').value;
    const accessToken = document.getElementById('accessToken').value;

    const outputText = document.getElementById('outputText');
    outputText.value = '';

    try {
        // Parse repository URL and fetch repository contents
        const { owner, repo, refFromUrl, pathFromUrl } = parseRepoUrl(repoUrl);
        const sha = await fetchRepoSha(owner, repo, refFromUrl, pathFromUrl, accessToken);
        const tree = await fetchRepoTree(owner, repo, sha, accessToken);

        displayDirectoryStructure(tree);
        document.getElementById('generateTextButton').style.display = 'flex';
        document.getElementById('downloadZipButton').style.display = 'flex';
    } catch (error) {
        outputText.value = `Error fetching repository contents: ${error.message}\n\n` +
            "Please ensure:\n" +
            "1. The repository URL is correct and accessible.\n" +
            "2. You have the necessary permissions to access the repository.\n" +
            "3. If it's a private repository, you've provided a valid access token.\n" +
            "4. The specified branch/tag and path (if any) exist in the repository.";
    }
});

// Event listener for generating text file
document.getElementById('generateTextButton').addEventListener('click', async function () {
    const accessToken = document.getElementById('accessToken').value;
    const outputText = document.getElementById('outputText');
    outputText.value = '';

    try {
        const selectedFiles = getSelectedFiles();
        if (selectedFiles.length === 0) {
            throw new Error('No files selected');
        }
        const fileContents = await fetchFileContents(selectedFiles, accessToken);
        const formattedText = formatRepoContents(fileContents);
        outputText.value = formattedText;

        document.getElementById('copyButton').style.display = 'flex';
        document.getElementById('downloadButton').style.display = 'flex';
    } catch (error) {
        outputText.value = `Error generating text file: ${error.message}\n\n` +
            "Please ensure:\n" +
            "1. You have selected at least one file from the directory structure.\n" +
            "2. Your access token (if provided) is valid and has the necessary permissions.\n" +
            "3. You have a stable internet connection.\n" +
            "4. The GitHub API is accessible and functioning normally.";
    }
});

// Event listener for downloading zip file
document.getElementById('downloadZipButton').addEventListener('click', async function () {
    const accessToken = document.getElementById('accessToken').value;

    try {
        const selectedFiles = getSelectedFiles();
        if (selectedFiles.length === 0) {
            throw new Error('No files selected');
        }
        const fileContents = await fetchFileContents(selectedFiles, accessToken);
        await createAndDownloadZip(fileContents);
    } catch (error) {
        const outputText = document.getElementById('outputText');
        outputText.value = `Error generating zip file: ${error.message}\n\n` +
            "Please ensure:\n" +
            "1. You have selected at least one file from the directory structure.\n" +
            "2. Your access token (if provided) is valid and has the necessary permissions.\n" +
            "3. You have a stable internet connection.\n" +
            "4. The GitHub API is accessible and functioning normally.";
    }
});

// Event listener for copying text to clipboard
document.getElementById('copyButton').addEventListener('click', function () {
    const outputText = document.getElementById('outputText');
    outputText.select();
    navigator.clipboard.writeText(outputText.value)
        .then(() => console.log('Text copied to clipboard'))
        .catch(err => console.error('Failed to copy text: ', err));
});

// Event listener for downloading text file
document.getElementById('downloadButton').addEventListener('click', function () {
    const outputText = document.getElementById('outputText').value;
    if (!outputText.trim()) {
        document.getElementById('outputText').value = 'Error: No content to download. Please generate the text file first.';
        return;
    }
    const blob = new Blob([outputText], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'prompt.txt';
    a.click();
    URL.revokeObjectURL(url);
});

// Parse GitHub repository URL
function parseRepoUrl(url) {
    url = url.replace(/\/$/, '');
    const urlPattern = /^https:\/\/github\.com\/([^\/]+)\/([^\/]+)(\/tree\/([^\/]+)(\/(.+))?)?$/;
    const match = url.match(urlPattern);
    if (!match) {
        throw new Error('Invalid GitHub repository URL. Please ensure the URL is in the correct format: ' +
            'https://github.com/owner/repo or https://github.com/owner/repo/tree/branch/path');
    }
    return {
        owner: match[1],
        repo: match[2],
        refFromUrl: match[4],
        pathFromUrl: match[6]
    };
}

// Fetch repository SHA
async function fetchRepoSha(owner, repo, ref, path, token) {
    const url = `https://api.github.com/repos/${owner}/${repo}/contents/${path ? `${path}` : ''}${ref ? `?ref=${ref}` : ''}`;
    const headers = {
        'Accept': 'application/vnd.github.object+json'
    };
    if (token) {
        headers['Authorization'] = `token ${token}`;
    }
    const response = await fetch(url, { headers });
    if (!response.ok) {
        handleFetchError(response);
    }
    const data = await response.json();
    return data.sha;
}

// Fetch repository tree
async function fetchRepoTree(owner, repo, sha, token) {
    const url = `https://api.github.com/repos/${owner}/${repo}/git/trees/${sha}?recursive=1`;
    const headers = {
        'Accept': 'application/vnd.github+json'
    };
    if (token) {
        headers['Authorization'] = `token ${token}`;
    }
    const response = await fetch(url, { headers });
    if (!response.ok) {
        handleFetchError(response);
    }
    const data = await response.json();
    return data.tree;
}

// Handle fetch errors
function handleFetchError(response) {
    if (response.status === 403 && response.headers.get('X-RateLimit-Remaining') === '0') {
        throw new Error('GitHub API rate limit exceeded. Please try again later or provide a valid access token to increase your rate limit.');
    }
    if (response.status === 404) {
        throw new Error(`Repository, branch, or path not found. Please check that the URL, branch/tag, and path are correct and accessible.`);
    }
    throw new Error(`Failed to fetch repository data. Status: ${response.status}. Please check your input and try again.`);
}

// Display directory structure
function displayDirectoryStructure(tree) {
    tree = tree.filter(item => item.type === 'blob').sort(sortContents);
    const container = document.getElementById('directoryStructure');
    container.innerHTML = '';
    const rootUl = document.createElement('ul');
    container.appendChild(rootUl);

    const commonExtensions = ['.js', '.py', '.java', '.cpp', '.html', '.css', '.ts', '.jsx', '.tsx'];
    const directoryStructure = {};
    const extensionCheckboxes = {};

    // Build directory structure
    tree.forEach(item => {
        item.path = item.path.startsWith('/') ? item.path : '/' + item.path;
        const pathParts = item.path.split('/');
        let currentLevel = directoryStructure;

        pathParts.forEach((part, index) => {
            part = part === '' ? './' : part;
            if (!currentLevel[part]) {
                currentLevel[part] = index === pathParts.length - 1 ? item : {};
            }
            currentLevel = currentLevel[part];
        });
    });

    function createTreeNode(name, item, parentUl) {
        const li = document.createElement('li');
        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.className = 'mr-2';
        
        if (typeof item === 'object' && (!item.type || typeof item.type !== 'string')) {
            // Directory node
            createDirectoryNode(li, checkbox, name, item, parentUl);
        } else {
            // File node
            createFileNode(li, checkbox, name, item);
        }

        li.className = 'my-2';
        parentUl.appendChild(li);
        updateParentCheckbox(checkbox);
        updateExtensionCheckboxes();
    }

    function createDirectoryNode(li, checkbox, name, item, parentUl) {
        checkbox.classList.add('directory-checkbox');
        li.appendChild(checkbox);

        const collapseButton = createCollapseButton();
        li.appendChild(collapseButton);

        appendIcon(li, 'folder');
        li.appendChild(document.createTextNode(name));

        const ul = document.createElement('ul');
        ul.className = 'ml-6 mt-2';
        li.appendChild(ul);
        
        for (const [childName, childItem] of Object.entries(item)) {
            createTreeNode(childName, childItem, ul);
        }

        addDirectoryCheckboxListener(checkbox, li);
        addCollapseButtonListener(collapseButton, ul);
    }

    function createFileNode(li, checkbox, name, item) {
        checkbox.value = JSON.stringify({ url: item.url, path: item.path });
        
        const extension = name.split('.').pop().toLowerCase();
        const isCommonFile = commonExtensions.includes('.' + extension);
        checkbox.checked = isCommonFile;

        if (!(extension in extensionCheckboxes)) {
            extensionCheckboxes[extension] = {
                checkbox: createExtensionCheckbox(extension),
                children: []
            };
        }
        extensionCheckboxes[extension].children.push(checkbox);

        li.appendChild(checkbox);
        appendIcon(li, 'file');
        li.appendChild(document.createTextNode(name));
    }

    function createCollapseButton() {
        const collapseButton = document.createElement('button');
        collapseButton.innerHTML = '<i data-lucide="chevron-down" class="w-4 h-4"></i>';
        collapseButton.className = 'mr-1 focus:outline-none';
        return collapseButton;
    }

    function appendIcon(element, iconName) {
        const icon = document.createElement('i');
        icon.setAttribute('data-lucide', iconName);
        icon.className = 'inline-block w-4 h-4 mr-1';
        element.appendChild(icon);
    }

    function addDirectoryCheckboxListener(checkbox, li) {
        checkbox.addEventListener('change', function() {
            const childCheckboxes = li.querySelectorAll('input[type="checkbox"]');
            childCheckboxes.forEach(childBox => {
                childBox.checked = this.checked;
                childBox.indeterminate = false;
            });
        });
    }

    function addCollapseButtonListener(collapseButton, ul) {
        collapseButton.addEventListener('click', function() {
            ul.classList.toggle('hidden');
            const icon = this.querySelector('[data-lucide]');
            if (ul.classList.contains('hidden')) {
                icon.setAttribute('data-lucide', 'chevron-right');
            } else {
                icon.setAttribute('data-lucide', 'chevron-down');
            }
            lucide.createIcons();
        });
    }

    function createExtensionCheckbox(extension) {
        const extCheckbox = document.createElement('input');
        extCheckbox.type = 'checkbox';
        extCheckbox.className = 'mr-1';
        extCheckbox.value = extension;
        return extCheckbox;
    }

    for (const [name, item] of Object.entries(directoryStructure)) {
        createTreeNode(name, item, rootUl);
    }

    createExtensionCheckboxesContainer();

    // Add event listener to container for checkbox changes
    container.addEventListener('change', function(event) {
        if (event.target.type === 'checkbox') {
            updateParentCheckbox(event.target);
            updateExtensionCheckboxes();
        }
    });

    function updateParentCheckbox(checkbox) {
        if (!checkbox) return;
        const li = checkbox.closest('li');
        if (!li) return;
        if (!li.parentElement) return;
        const parentLi = li.parentElement.closest('li');
        if (!parentLi) return;

        const parentCheckbox = parentLi.querySelector(':scope > input[type="checkbox"]');
        const siblingCheckboxes = parentLi.querySelectorAll(':scope > ul > li > input[type="checkbox"]');
        
        const checkedCount = Array.from(siblingCheckboxes).filter(cb => cb.checked).length;
        const indeterminateCount = Array.from(siblingCheckboxes).filter(cb => cb.indeterminate).length;
        
        if (indeterminateCount !== 0) {
            parentCheckbox.checked = false;
            parentCheckbox.indeterminate = true;
        } else if (checkedCount === 0) {
            parentCheckbox.checked = false;
            parentCheckbox.indeterminate = false;
        } else if (checkedCount === siblingCheckboxes.length) {
            parentCheckbox.checked = true;
            parentCheckbox.indeterminate = false;
        } else {
            parentCheckbox.checked = false;
            parentCheckbox.indeterminate = true;
        }

        // Recursively update parent checkboxes
        updateParentCheckbox(parentCheckbox);
    }

    function updateExtensionCheckboxes() {
        for (const [extension, checkbox] of Object.entries(extensionCheckboxes)) {
            const children = checkbox.children;
            const checkedCount = Array.from(children).filter(cb => cb.checked).length;

            if (checkedCount === 0) {
                checkbox.checkbox.checked = false;
                checkbox.checkbox.indeterminate = false;
            } else if (checkedCount === children.length) {
                checkbox.checkbox.checked = true;
                checkbox.checkbox.indeterminate = false;
            } else {
                checkbox.checkbox.checked = false;
                checkbox.checkbox.indeterminate = true;
            }
        }
    }

    function createExtensionCheckboxesContainer() {
        const extentionCheckboxesContainer = document.getElementById('extentionCheckboxes');
        extentionCheckboxesContainer.innerHTML = '';
        extentionCheckboxesContainer.className = 'mt-4';
        const extentionCheckboxesContainerLabel = document.createElement('label');
        extentionCheckboxesContainerLabel.innerHTML = 'Filter by file extensions:';
        extentionCheckboxesContainerLabel.className = 'block text-sm font-medium text-gray-600';
        extentionCheckboxesContainer.appendChild(extentionCheckboxesContainerLabel);
        const extentionCheckboxesContainerUl = document.createElement('ul');
        extentionCheckboxesContainer.appendChild(extentionCheckboxesContainerUl);
        extentionCheckboxesContainerUl.className = 'mt-1';
        const sortedExtensions = Object.entries(extensionCheckboxes).sort((a, b) => b[1].children.length - a[1].children.length);
        for (const [extension, checkbox] of sortedExtensions) {
            const extCheckbox = checkbox.checkbox;
            const extCheckboxLi = document.createElement('li');
            extCheckboxLi.className = 'inline-block mr-4';
            extCheckboxLi.appendChild(extCheckbox);
            extCheckboxLi.appendChild(document.createTextNode('.' + extension));
            extentionCheckboxesContainerUl.appendChild(extCheckboxLi);
            extCheckbox.addEventListener('change', function() {
                const children = checkbox.children;
                children.forEach(child => {
                    child.checked = this.checked;
                    child.indeterminate = false;
                    updateParentCheckbox(child);
                });
            });
        }
    }

    lucide.createIcons();
}

// Get selected files from the directory structure
function getSelectedFiles() {
    const checkboxes = document.querySelectorAll('#directoryStructure input[type="checkbox"]:checked:not(.directory-checkbox)');
    return Array.from(checkboxes).map(checkbox => JSON.parse(checkbox.value));
}

// Fetch contents of selected files
async function fetchFileContents(files, token) {
    const headers = {
        'Accept': 'application/vnd.github.v3.raw'
    };
    if (token) {
        headers['Authorization'] = `token ${token}`;
    }
    const contents = await Promise.all(files.map(async file => {
        const response = await fetch(file.url, { headers });
        if (!response.ok) {
            handleFetchError(response);
        }
        const text = await response.text();
        return { url: file.url, path: file.path, text };
    }));
    return contents;
}

// Format repository contents into a single text
function formatRepoContents(contents) {
    let text = '';
    let index = '';

    // Ensure contents is an array before sorting
    contents = Array.isArray(contents) ? contents.sort(sortContents) : [contents];

    // Create a directory tree structure
    const tree = {};
    contents.forEach(item => {
        const parts = item.path.split('/');
        let currentLevel = tree;
        parts.forEach((part, i) => {
            if (!currentLevel[part]) {
                currentLevel[part] = i === parts.length - 1 ? null : {};
            }
            currentLevel = currentLevel[part];
        });
    });

    // Build the index recursively
    function buildIndex(node, prefix = '') {
        let result = '';
        const entries = Object.entries(node);
        entries.forEach(([name, subNode], index) => {
            const isLastItem = index === entries.length - 1;
            const linePrefix = isLastItem ? '└── ' : '├── ';
            const childPrefix = isLastItem ? '    ' : '│   ';

            name = name === '' ? './' : name;

            result += `${prefix}${linePrefix}${name}\n`;
            if (subNode) {
                result += buildIndex(subNode, `${prefix}${childPrefix}`);
            }
        });
        return result;
    }

    index = buildIndex(tree);

    contents.forEach((item) => {
        text += `\n\n---\nFile: ${item.path}\n---\n\n${item.text}\n`;
    });

    return `Directory Structure:\n\n${index}\n${text}`;
}

// Sort contents alphabetically and by directory/file
function sortContents(a, b) {
    if (!a || !b || !a.path || !b.path) return 0;
    
    const aPath = a.path.split('/');
    const bPath = b.path.split('/');
    const minLength = Math.min(aPath.length, bPath.length);

    for (let i = 0; i < minLength; i++) {
        if (aPath[i] !== bPath[i]) {
            if (i === aPath.length - 1 && i < bPath.length - 1) return 1; // a is a directory, b is a file or subdirectory
            if (i === bPath.length - 1 && i < aPath.length - 1) return -1;  // b is a directory, a is a file or subdirectory
            return aPath[i].localeCompare(bPath[i]);
        }
    }

    return aPath.length - bPath.length;
}

// Initialize Lucide icons and set up event listeners
document.addEventListener('DOMContentLoaded', function() {
    lucide.createIcons();
    setupShowMoreInfoButton();
});

function setupShowMoreInfoButton() {
    const showMoreInfoButton = document.getElementById('showMoreInfo');
    const tokenInfo = document.getElementById('tokenInfo');

    showMoreInfoButton.addEventListener('click', function() {
        tokenInfo.classList.toggle('hidden');
        updateInfoIcon(this, tokenInfo);
    });
}

function updateInfoIcon(button, tokenInfo) {
    const icon = button.querySelector('[data-lucide]');
    if (icon) {
        icon.setAttribute('data-lucide', tokenInfo.classList.contains('hidden') ? 'info' : 'x');
        lucide.createIcons();
    }
}

// Create and download zip file
async function createAndDownloadZip(fileContents) {
    const zip = new JSZip();

    fileContents.forEach(file => {
        // Remove leading slash if present
        const filePath = file.path.startsWith('/') ? file.path.slice(1) : file.path;
        zip.file(filePath, file.text);
    });

    const content = await zip.generateAsync({type: "blob"});
    const url = URL.createObjectURL(content);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'partial_repo.zip';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}