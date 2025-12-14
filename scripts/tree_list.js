class TreeList extends Application {
  constructor(category) {
    super();
    this.category = category;
    this.searchFilter = "";
  }

  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      id: "tree-list",
      title: "Trees",
      template: "modules/ironic-relational-tree/templates/tree-list.hbs",
      width: 600,
      height: 500,
      classes: ["tree-list"]
    });
  }

  async _getTrees() {
    let journal = game.journal.getName("Relational Trees Data");
    if (!journal) {
      journal = await JournalEntry.create({
        name: "Relational Trees Data",
        folder: null
      });
      await journal.createEmbeddedDocuments("JournalEntryPage", [{
        name: "Data",
        type: "text",
        text: { content: JSON.stringify({}) }
      }]);
    }
    const page = journal.pages.contents[0];
    return JSON.parse(page.text.content || '{}');
  }

  async _saveTrees(trees) {
    let journal = game.journal.getName("Relational Trees Data");
    const page = journal.pages.contents[0];
    await page.update({ "text.content": JSON.stringify(trees) });
  }

  async getData() {
    const trees = await this._getTrees();
    let categoryTrees = Object.entries(trees)
      .filter(([id, tree]) => tree.category === this.category)
      .map(([id, tree]) => ({
        id,
        ...tree,
        nodeCount: tree.nodes?.length || 0,
        connectionCount: tree.connections?.length || 0
      }));

    // Apply search filter
    if (this.searchFilter) {
      const filter = this.searchFilter.toLowerCase();
      categoryTrees = categoryTrees.filter(tree => 
        tree.name.toLowerCase().includes(filter)
      );
    }

    return {
      category: this.category,
      categoryName: this._getCategoryName(),
      trees: categoryTrees,
      searchFilter: this.searchFilter,
      isGM: game.user.isGM
    };
  }

  _getCategoryName() {
    const names = {
      family: "Family Trees",
      factions: "Factions",
      extras: "Extras"
    };
    return names[this.category] || this.category;
  }

  activateListeners(html) {
    super.activateListeners(html);
    
    // Search input
    html.find('.search-input').on('input', (event) => {
      this.searchFilter = $(event.currentTarget).val();
      this._updateTreeList(html);
    });

    // Clear search
    html.find('.search-clear').click(() => {
      this.searchFilter = "";
      html.find('.search-input').val("");
      this._updateTreeList(html);
    });

    // Open existing tree (but not if clicking on action buttons)
    html.find('.tree-item').click((event) => {
      if ($(event.target).closest('.tree-item-actions').length) return;
      
      const treeId = $(event.currentTarget).data('tree-id');
      new TreeViewer(treeId).render(true);
      this.close();
    });

    // Create new tree
    html.find('.create-tree').click(() => {
      this._createNewTree();
    });

    // Edit/Rename tree
    html.find('.edit-tree').click((event) => {
      event.stopPropagation();
      const treeId = $(event.currentTarget).closest('.tree-item').data('tree-id');
      const currentName = $(event.currentTarget).closest('.tree-item').find('.tree-name').text();
      this._renameTree(treeId, currentName);
    });

    // Delete tree
    html.find('.delete-tree').click((event) => {
      event.stopPropagation();
      const treeId = $(event.currentTarget).closest('.tree-item').data('tree-id');
      this._deleteTree(treeId);
    });

    // Export tree (GM only)
    html.find('.export-tree').click((event) => {
      event.stopPropagation();
      if (!game.user.isGM) {
        ui.notifications.warn("Only the GM can export trees");
        return;
      }
      const treeId = $(event.currentTarget).closest('.tree-item').data('tree-id');
      this._exportTree(treeId);
    });

    // Import tree (GM only)
    html.find('.import-tree').click(() => {
      if (!game.user.isGM) {
        ui.notifications.warn("Only the GM can import trees");
        return;
      }
      this._importTree();
    });

    // Export all trees in category (GM only)
    html.find('.export-all').click(() => {
      if (!game.user.isGM) {
        ui.notifications.warn("Only the GM can export trees");
        return;
      }
      this._exportAllTrees();
    });

    // Back button
    html.find('.back-button').click(() => {
      new RelationalTreeBrowser().render(true);
      this.close();
    });
  }

  async _updateTreeList(html) {
    const data = await this.getData();
    const treeItemsHtml = this._renderTreeItems(data.trees);
    html.find('.tree-items').html(treeItemsHtml);
    
    // Re-bind click events for the new elements
    this._bindTreeItemEvents(html);
  }

  _renderTreeItems(trees) {
    const isGM = game.user.isGM;
    
    if (trees.length === 0) {
      return `
        <div class="no-trees">
          <i class="fas fa-folder-open"></i>
          <p>${this.searchFilter ? 'No matching trees found' : 'No trees created yet'}</p>
          <span>${this.searchFilter ? 'Try a different search term' : 'Click "New Tree" to get started'}</span>
        </div>
      `;
    }

    return trees.map(tree => `
      <div class="tree-item" data-tree-id="${tree.id}">
        <div class="tree-item-info">
          <i class="fas fa-project-diagram tree-item-icon"></i>
          <div class="tree-item-details">
            <span class="tree-name">${tree.name}</span>
            <span class="tree-meta">${tree.nodeCount} characters · ${tree.connectionCount} connections</span>
          </div>
        </div>
        <div class="tree-item-actions">
          ${isGM ? `
          <button class="export-tree" title="Export JSON">
            <i class="fas fa-download"></i>
          </button>
          ` : ''}
          <button class="edit-tree" title="Rename">
            <i class="fas fa-edit"></i>
          </button>
          <button class="delete-tree" title="Delete">
            <i class="fas fa-trash"></i>
          </button>
        </div>
      </div>
    `).join('');
  }

  _bindTreeItemEvents(html) {
    // Open existing tree
    html.find('.tree-item').off('click').on('click', (event) => {
      if ($(event.target).closest('.tree-item-actions').length) return;
      
      const treeId = $(event.currentTarget).data('tree-id');
      new TreeViewer(treeId).render(true);
      this.close();
    });

    // Edit/Rename tree
    html.find('.edit-tree').off('click').on('click', (event) => {
      event.stopPropagation();
      const treeId = $(event.currentTarget).closest('.tree-item').data('tree-id');
      const currentName = $(event.currentTarget).closest('.tree-item').find('.tree-name').text();
      this._renameTree(treeId, currentName);
    });

    // Delete tree
    html.find('.delete-tree').off('click').on('click', (event) => {
      event.stopPropagation();
      const treeId = $(event.currentTarget).closest('.tree-item').data('tree-id');
      this._deleteTree(treeId);
    });

    // Export tree (GM only)
    html.find('.export-tree').off('click').on('click', (event) => {
      event.stopPropagation();
      if (!game.user.isGM) {
        ui.notifications.warn("Only the GM can export trees");
        return;
      }
      const treeId = $(event.currentTarget).closest('.tree-item').data('tree-id');
      this._exportTree(treeId);
    });
  }

  async _createNewTree() {
    const name = await Dialog.prompt({
      title: "Create New Tree",
      content: `
        <form>
          <div class="form-group">
            <label>Tree Name:</label>
            <input type="text" name="treeName" autofocus />
          </div>
        </form>
      `,
      callback: (html) => html.find('[name="treeName"]').val()
    });

    if (!name) return;

    const trees = await this._getTrees();
    const treeId = foundry.utils.randomID();
    
    trees[treeId] = {
      name: name,
      category: this.category,
      nodes: [],
      connections: []
    };

    await this._saveTrees(trees);
    this.render();
  }

  async _renameTree(treeId, currentName) {
    const newName = await Dialog.prompt({
      title: "Rename Tree",
      content: `
        <form>
          <div class="form-group">
            <label>Tree Name:</label>
            <input type="text" name="treeName" value="${currentName}" autofocus />
          </div>
        </form>
      `,
      callback: (html) => html.find('[name="treeName"]').val()
    });

    if (!newName || newName === currentName) return;

    const trees = await this._getTrees();
    
    if (trees[treeId]) {
      trees[treeId].name = newName;
      await this._saveTrees(trees);
      ui.notifications.info(`Renamed tree to "${newName}"`);
      this.render();
    }
  }

  async _deleteTree(treeId) {
    const trees = await this._getTrees();
    const treeName = trees[treeId]?.name || "this tree";
    
    const confirm = await Dialog.confirm({
      title: "Delete Tree",
      content: `<p>Are you sure you want to delete "<strong>${treeName}</strong>"?</p><p>This action cannot be undone.</p>`
    });

    if (!confirm) return;

    delete trees[treeId];
    await this._saveTrees(trees);
    ui.notifications.info(`Deleted "${treeName}"`);
    this.render();
  }

  async _exportTree(treeId) {
    if (!game.user.isGM) {
      ui.notifications.warn("Only the GM can export trees");
      return;
    }

    const trees = await this._getTrees();
    const tree = trees[treeId];
    
    if (!tree) {
      ui.notifications.error("Tree not found");
      return;
    }

    const exportData = {
      exportVersion: 1,
      exportDate: new Date().toISOString(),
      type: "single",
      tree: {
        id: treeId,
        ...tree
      }
    };

    const filename = `${tree.name.replace(/[^a-z0-9]/gi, '_')}_tree.json`;
    this._downloadJSON(exportData, filename);
    ui.notifications.info(`Exported "${tree.name}"`);
  }

  async _exportAllTrees() {
    if (!game.user.isGM) {
      ui.notifications.warn("Only the GM can export trees");
      return;
    }

    const trees = await this._getTrees();
    const categoryTrees = Object.entries(trees)
      .filter(([id, tree]) => tree.category === this.category)
      .reduce((acc, [id, tree]) => {
        acc[id] = tree;
        return acc;
      }, {});

    const count = Object.keys(categoryTrees).length;
    
    if (count === 0) {
      ui.notifications.warn("No trees to export in this category");
      return;
    }

    const exportData = {
      exportVersion: 1,
      exportDate: new Date().toISOString(),
      type: "category",
      category: this.category,
      trees: categoryTrees
    };

    const filename = `${this.category}_trees_export.json`;
    this._downloadJSON(exportData, filename);
    ui.notifications.info(`Exported ${count} tree(s) from ${this._getCategoryName()}`);
  }

  _downloadJSON(data, filename) {
  const jsonStr = JSON.stringify(data, null, 2);
  
  // Use Foundry's built-in save method if available
  if (typeof saveDataToFile === 'function') {
    saveDataToFile(jsonStr, 'application/json', filename);
  } else {
    // Fallback for older versions
    const blob = new Blob([jsonStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.style.display = 'none';
    document.body.appendChild(a);
    
    // Use setTimeout to ensure the click happens properly
    setTimeout(() => {
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }, 0);
  }
}

  async _importTree() {
    if (!game.user.isGM) {
      ui.notifications.warn("Only the GM can import trees");
      return;
    }

    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    
    input.onchange = async (event) => {
      const file = event.target.files[0];
      if (!file) return;

      try {
        const text = await file.text();
        const importData = JSON.parse(text);
        
        await this._processImport(importData);
      } catch (err) {
        console.error('Import error:', err);
        ui.notifications.error("Failed to import: Invalid JSON file");
      }
    };

    input.click();
  }

  async _processImport(importData) {
    // Validate import data
    if (!importData.exportVersion) {
      ui.notifications.error("Invalid import file: Missing version info");
      return;
    }

    const trees = await this._getTrees();
    let importCount = 0;

    if (importData.type === "single" && importData.tree) {
      // Single tree import
      const result = await this._importSingleTree(trees, importData.tree);
      if (result) importCount = 1;
    } else if (importData.type === "category" && importData.trees) {
      // Multiple trees import
      const confirm = await Dialog.confirm({
        title: "Import Multiple Trees",
        content: `<p>This will import ${Object.keys(importData.trees).length} tree(s) into ${this._getCategoryName()}.</p><p>Continue?</p>`
      });

      if (!confirm) return;

      for (const [id, tree] of Object.entries(importData.trees)) {
        const result = await this._importSingleTree(trees, { id, ...tree }, false);
        if (result) importCount++;
      }
    } else {
      ui.notifications.error("Invalid import file format");
      return;
    }

    if (importCount > 0) {
      await this._saveTrees(trees);
      ui.notifications.info(`Successfully imported ${importCount} tree(s)`);
      this.render();
    }
  }

  async _importSingleTree(trees, treeData, showDialog = true) {
    // Check for name conflicts
    const existingEntry = Object.entries(trees)
      .find(([id, t]) => t.category === this.category && t.name === treeData.name);

    let newName = treeData.name;
    let targetId = foundry.utils.randomID();
    
    if (existingEntry) {
      const [existingId, existingTree] = existingEntry;
      
      if (showDialog) {
        const action = await Dialog.wait({
          title: "Name Conflict",
          content: `<p>A tree named "<strong>${newName}</strong>" already exists.</p><p>What would you like to do?</p>`,
          buttons: {
            overwrite: {
              icon: '<i class="fas fa-sync"></i>',
              label: "Overwrite",
              callback: () => "overwrite"
            },
            duplicate: {
              icon: '<i class="fas fa-copy"></i>',
              label: "Import as Copy",
              callback: () => "duplicate"
            },
            rename: {
              icon: '<i class="fas fa-edit"></i>',
              label: "Rename",
              callback: () => "rename"
            },
            skip: {
              icon: '<i class="fas fa-times"></i>',
              label: "Skip",
              callback: () => "skip"
            }
          },
          default: "duplicate"
        });

        if (action === "skip") return false;
        
        if (action === "overwrite") {
          // Use the existing ID to overwrite
          targetId = existingId;
        } else if (action === "rename") {
          newName = await Dialog.prompt({
            title: "Rename Imported Tree",
            content: `
              <form>
                <div class="form-group">
                  <label>New Name:</label>
                  <input type="text" name="treeName" value="${newName}" autofocus />
                </div>
              </form>
            `,
            callback: (html) => html.find('[name="treeName"]').val()
          });
          
          if (!newName) return false;
          
          // Check if new name also conflicts
          const stillConflicts = Object.values(trees)
            .some(t => t.category === this.category && t.name === newName);
          
          if (stillConflicts) {
            ui.notifications.warn(`"${newName}" also exists. Importing as copy.`);
            let counter = 1;
            const baseName = newName;
            while (Object.values(trees).some(t => t.category === this.category && t.name === newName)) {
              newName = `${baseName} (${counter++})`;
            }
          }
        } else if (action === "duplicate") {
          let counter = 1;
          const existingNames = Object.values(trees)
            .filter(t => t.category === this.category)
            .map(t => t.name);
          
          while (existingNames.includes(newName)) {
            newName = `${treeData.name} (${counter++})`;
          }
        }
      } else {
        // Auto-rename for bulk imports
        let counter = 1;
        const existingNames = Object.values(trees)
          .filter(t => t.category === this.category)
          .map(t => t.name);
        
        while (existingNames.includes(newName)) {
          newName = `${treeData.name} (${counter++})`;
        }
      }
    }

    // Create or overwrite tree
    trees[targetId] = {
      name: newName,
      category: this.category,
      nodes: treeData.nodes || [],
      connections: treeData.connections || []
    };

    return true;
  }
}