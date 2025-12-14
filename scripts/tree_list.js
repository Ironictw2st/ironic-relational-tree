class TreeList extends Application {
  constructor(category) {
    super();
    this.category = category;
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
    const categoryTrees = Object.entries(trees)
      .filter(([id, tree]) => tree.category === this.category)
      .map(([id, tree]) => ({
        id,
        ...tree,
        nodeCount: tree.nodes?.length || 0,
        connectionCount: tree.connections?.length || 0
      }));

    return {
      category: this.category,
      categoryName: this._getCategoryName(),
      trees: categoryTrees
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

    // Back button
    html.find('.back-button').click(() => {
      new RelationalTreeBrowser().render(true);
      this.close();
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
}