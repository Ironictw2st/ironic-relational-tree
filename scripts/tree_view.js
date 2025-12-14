class TreeViewer extends Application {
  constructor(treeId) {
    super();
    this.treeId = treeId;
    this.draggedNode = null;
    this.connectingFrom = null;
    this.connectionType = 'neutral';
  }

  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      id: "tree-viewer",
      title: "Tree Viewer",
      template: "modules/ironic-relational-tree/templates/tree-viewer.hbs",
      width: 900,
      height: 700,
      classes: ["tree-viewer"],
      resizable: true,
      dragDrop: [{ dropSelector: ".tree-canvas" }]
    });
  }

  static CONNECTION_TYPES = {
    rival: {color: '#800000', label: 'Rival'},
    enemy: { color: '#ff4444', label: 'Enemy' },
    neutral: { color: '#888888', label: 'Neutral' },
    friendly: { color: '#44ff44', label: 'Friendly' },
    faction: { color: '#00FFFF', label: 'Alliance'},
    family: { color: '#aa44ff', label: 'Family' },
    romantic: { color: '#ff69b4', label: 'Romantic' }
  };

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
    const tree = trees[this.treeId];

    if (!tree) {
      this._data = {
        tree: { name: "Unknown Tree", nodes: [], connections: [] },
        treeId: this.treeId,
        nodes: [],
        connections: [],
        connectionTypes: TreeViewer.CONNECTION_TYPES
      };
      return this._data;
    }

    const enrichedNodes = tree.nodes?.map(node => {
      const actor = game.actors.get(node.actorId);
      const size = node.size || 80;
      const fontSize = Math.max(10, Math.min(18, Math.round(size * 0.15)));
      const nameMaxWidth = Math.max(80, size * 1.5);
      
      return {
        ...node,
        actorName: actor?.name || "Unknown",
        actorImg: actor?.img || "icons/svg/mystery-man.svg",
        size: size,
        fontSize: fontSize,
        nameMaxWidth: nameMaxWidth
      };
    }) || [];

    const enrichedConnections = (tree.connections || []).map(conn => {
      const type = conn.type || 'neutral';
      return {
        ...conn,
        color: TreeViewer.CONNECTION_TYPES[type]?.color || '#888888',
        label: TreeViewer.CONNECTION_TYPES[type]?.label || 'Neutral'
      };
    });

    this._data = {
      tree: tree,
      treeId: this.treeId,
      nodes: enrichedNodes,
      connections: enrichedConnections,
      connectionTypes: TreeViewer.CONNECTION_TYPES
    };

    return this._data;
  }

  _canDragDrop(selector) {
    return true;
  }

  async _onDrop(event) {
    let data;
    try {
      data = JSON.parse(event.dataTransfer.getData('text/plain'));
    } catch (err) {
      console.error('Error parsing drop data:', err);
      return;
    }

    if (data.type === 'Actor') {
      const canvas = $(event.target).closest('.tree-canvas')[0];
      if (!canvas) {
        return;
      }
      
      const rect = canvas.getBoundingClientRect();
      const x = event.clientX - rect.left + canvas.scrollLeft;
      const y = event.clientY - rect.top + canvas.scrollTop;
      
      await this._addNodeAtPosition(data.uuid, x, y);
    }
  }

  async _addNodeAtPosition(uuid, x, y) {
    const actor = await fromUuid(uuid);
    if (!actor) {
      ui.notifications.error("Could not find actor");
      return;
    }

    const trees = await this._getTrees();
    const tree = trees[this.treeId];
    
    if (!tree) {
      ui.notifications.error("Tree not found");
      return;
    }

    if (!tree.nodes) {
      tree.nodes = [];
    }

    if (!tree.connections) {
      tree.connections = [];
    }

    const existingNode = tree.nodes.find(n => n.actorId === actor.id);
    if (existingNode) {
      ui.notifications.warn(`${actor.name} is already in this tree`);
      return;
    }

    const newNode = {
      id: foundry.utils.randomID(),
      actorId: actor.id,
      x: x,
      y: y,
      size: 80
    };

    tree.nodes.push(newNode);
    await this._saveTrees(trees);
    
    ui.notifications.info(`Added ${actor.name} to the tree`);
    this.render();
  }

  activateListeners(html) {
    super.activateListeners(html);
    
    let canvas = html.hasClass('tree-canvas') ? html : html.find('.tree-canvas');
    
    if (!canvas.length) {
      canvas = $(this.element).find('.tree-canvas');
    }
    
    const svg = canvas.find('.connection-layer');

    if (canvas.length) {
      const canvasEl = canvas[0];
      
      canvasEl.ondragover = (ev) => {
        ev.preventDefault();
        ev.dataTransfer.dropEffect = "copy";
        canvasEl.style.backgroundColor = 'rgba(0, 100, 255, 0.1)';
        return false;
      };
      
      canvasEl.ondragleave = (ev) => {
        canvasEl.style.backgroundColor = '';
      };

      html.find('.tree-node').each((i, el) => {
        this._makeNodeDraggable($(el), canvas[0], svg[0]);
      });

      setTimeout(() => {
        this._drawAllConnections(html);
      }, 50);
    }

    // Remove node button
    html.find('.remove-node').click((event) => {
      event.stopPropagation();
      event.preventDefault();
      const nodeId = $(event.currentTarget).closest('.tree-node').data('node-id');
      this._removeNode(nodeId);
    });

    // Connect node button - shows connection type picker
    html.find('.connect-node').on('click', (event) => {
      event.stopImmediatePropagation();
      event.preventDefault();
      
      // Remove any existing picker first
      $(this.element).find('.connection-type-picker').remove();
      
      const nodeId = $(event.currentTarget).closest('.tree-node').data('node-id');
      this._showConnectionTypePicker(event, nodeId, html);
    });

    // Click on node to complete connection
    html.find('.tree-node').on('click', (event) => {
      // Ignore if clicking on a button
      if ($(event.target).closest('button').length) {
        return;
      }
      
      if (this.connectingFrom !== null) {
        event.stopPropagation();
        event.preventDefault();
        const nodeId = $(event.currentTarget).data('node-id');
        
        if (this.connectingFrom !== nodeId) {
          this._createConnection(this.connectingFrom, nodeId, this.connectionType);
          html.find('.tree-node').removeClass('connecting');
          $(this.element).find('.connection-type-picker').remove();
          this.connectingFrom = null;
          this.connectionType = 'neutral';
        }
      }
    });

    // Cancel connection on canvas click
    canvas.on('click', (event) => {
      if ($(event.target).closest('.tree-node').length) return;
      if ($(event.target).closest('.connection-type-picker').length) return;
      if ($(event.target).closest('.connection-edit-menu').length) return;
      if ($(event.target).closest('.tree-legend').length) return;
      
      if (this.connectingFrom !== null) {
        html.find('.tree-node').removeClass('connecting');
        $(this.element).find('.connection-type-picker').remove();
        this.connectingFrom = null;
        this.connectionType = 'neutral';
        ui.notifications.info("Connection cancelled");
      }
    });

    // Resize buttons
    html.find('.resize-larger').click((event) => {
      event.stopPropagation();
      event.preventDefault();
      const nodeId = $(event.currentTarget).closest('.tree-node').data('node-id');
      this._resizeNode(nodeId, 10);
    });

    html.find('.resize-smaller').click((event) => {
      event.stopPropagation();
      event.preventDefault();
      const nodeId = $(event.currentTarget).closest('.tree-node').data('node-id');
      this._resizeNode(nodeId, -10);
    });

    // Back to list button
    html.find('.back-to-list').click(async () => {
      const trees = await this._getTrees();
      const category = trees[this.treeId]?.category;
      new TreeList(category).render(true);
      this.close();
    });

    // Setup SVG click handler for connection lines
    this._setupConnectionLineHandlers(svg);
  }

  _setupConnectionLineHandlers(svg) {
    svg.on('click', '.connection-line', (event) => {
      event.stopPropagation();
      const line = $(event.target);
      const fromId = line.attr('data-from');
      const toId = line.attr('data-to');
      this._showConnectionEditMenu(event, fromId, toId);
    });
  }

  _showConnectionTypePicker(event, nodeId, html) {
  if (this.connectingFrom === nodeId) {
    this.connectingFrom = null;
    html.find('.tree-node').removeClass('connecting');
    ui.notifications.info("Connection cancelled");
    return;
  }

  const picker = $(`
    <div class="connection-type-picker">
      <div class="picker-title">Select Relationship Type</div>
      ${Object.entries(TreeViewer.CONNECTION_TYPES).map(([key, value]) => `
        <button class="picker-option" data-type="${key}">
          <span class="color-indicator" style="background-color: ${value.color};"></span>
          ${value.label}
        </button>
      `).join('')}
      <button class="picker-cancel">Cancel</button>
    </div>
  `);

  // Get the node element for positioning
  const nodeEl = $(event.currentTarget).closest('.tree-node')[0];
  const nodeRect = nodeEl.getBoundingClientRect();
  const containerRect = this.element[0].getBoundingClientRect();
  
  // Position to the right of the node with some offset
  picker.css({
    position: 'absolute',
    left: (nodeRect.right - containerRect.left + 10) + 'px',  // 10px to the right of the node
    top: (nodeRect.top - containerRect.top) + 'px',
    zIndex: 1000
  });

  $(this.element).find('.window-content').append(picker);

  picker.find('.picker-option').on('click', (e) => {
    e.stopImmediatePropagation();
    e.preventDefault();
    const type = $(e.currentTarget).data('type');
    this.connectionType = type;
    this.connectingFrom = nodeId;
    
    html.find(`[data-node-id="${nodeId}"]`).addClass('connecting');
    picker.remove();
    
    const typeLabel = TreeViewer.CONNECTION_TYPES[type].label;
    ui.notifications.info(`Creating ${typeLabel} connection. Click another node to connect.`);
  });

  picker.find('.picker-cancel').on('click', (e) => {
    e.stopImmediatePropagation();
    e.preventDefault();
    picker.remove();
  });
}

  _showConnectionEditMenu(event, fromId, toId) {
    $(this.element).find('.connection-edit-menu').remove();

    const menu = $(`
      <div class="connection-edit-menu">
        <div class="menu-title">Edit Connection</div>
        <div class="menu-section">Change Type:</div>
        ${Object.entries(TreeViewer.CONNECTION_TYPES).map(([key, value]) => `
          <button class="menu-option change-type" data-type="${key}">
            <span class="color-indicator" style="background-color: ${value.color};"></span>
            ${value.label}
          </button>
        `).join('')}
        <hr>
        <button class="menu-option delete-connection">
          <i class="fas fa-trash"></i> Delete Connection
        </button>
      </div>
    `);

    const containerRect = this.element[0].getBoundingClientRect();
    menu.css({
      position: 'absolute',
      left: (event.clientX - containerRect.left) + 'px',
      top: (event.clientY - containerRect.top) + 'px',
      zIndex: 1000
    });

    $(this.element).find('.window-content').append(menu);

    menu.find('.change-type').on('click', async (e) => {
      e.stopImmediatePropagation();
      const newType = $(e.currentTarget).data('type');
      await this._changeConnectionType(fromId, toId, newType);
      menu.remove();
    });

    menu.find('.delete-connection').on('click', async (e) => {
      e.stopImmediatePropagation();
      await this._removeConnection(fromId, toId);
      menu.remove();
    });

    setTimeout(() => {
      $(document).one('click', () => menu.remove());
    }, 100);
  }

  async _changeConnectionType(fromId, toId, newType) {
    const trees = await this._getTrees();
    const tree = trees[this.treeId];
    
    const connection = tree.connections.find(c => 
      (c.from === fromId && c.to === toId) ||
      (c.from === toId && c.to === fromId)
    );
    
    if (connection) {
      connection.type = newType;
      await this._saveTrees(trees);
      ui.notifications.info(`Changed connection to ${TreeViewer.CONNECTION_TYPES[newType].label}`);
      this.render();
    }
  }

  _makeNodeDraggable($node, canvas, svg) {
    const node = $node[0];
    let isDragging = false;
    let startX, startY, initialLeft, initialTop;

    const onMouseDown = (e) => {
      if ($(e.target).closest('button').length) return;
      if (this.connectingFrom !== null) return;
      
      isDragging = true;
      startX = e.clientX;
      startY = e.clientY;
      initialLeft = parseInt($node.css('left'));
      initialTop = parseInt($node.css('top'));
      
      $node.addClass('dragging');
      e.preventDefault();
    };

    const onMouseMove = (e) => {
      if (!isDragging) return;
      
      const dx = e.clientX - startX;
      const dy = e.clientY - startY;
      
      const newLeft = initialLeft + dx;
      const newTop = initialTop + dy;
      
      $node.css({
        left: newLeft + 'px',
        top: newTop + 'px'
      });

      this._updateConnectionsForNode($node.data('node-id'), $(canvas).parent());
    };

    const onMouseUp = async (e) => {
      if (!isDragging) return;
      
      isDragging = false;
      $node.removeClass('dragging');
      
      const nodeId = $node.data('node-id');
      const newX = parseInt($node.css('left'));
      const newY = parseInt($node.css('top'));
      
      await this._updateNodePosition(nodeId, newX, newY);
    };

    node.addEventListener('mousedown', onMouseDown);
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
  }

  async _updateNodePosition(nodeId, x, y) {
    const trees = await this._getTrees();
    const tree = trees[this.treeId];
    const node = tree.nodes.find(n => n.id === nodeId);
    
    if (node) {
      node.x = x;
      node.y = y;
      await this._saveTrees(trees);
    }
  }

  async _resizeNode(nodeId, delta) {
    const trees = await this._getTrees();
    const tree = trees[this.treeId];
    const node = tree.nodes.find(n => n.id === nodeId);
    
    if (node) {
      node.size = Math.max(40, Math.min(200, (node.size || 80) + delta));
      await this._saveTrees(trees);
      this.render();
    }
  }

  async _createConnection(fromId, toId, type = 'neutral') {
    const trees = await this._getTrees();
    const tree = trees[this.treeId];
    
    if (!tree.connections) {
      tree.connections = [];
    }
    
    const exists = tree.connections.some(c => 
      (c.from === fromId && c.to === toId) || 
      (c.from === toId && c.to === fromId)
    );
    
    if (exists) {
      ui.notifications.warn("These nodes are already connected");
      return;
    }
    
    tree.connections.push({ from: fromId, to: toId, type: type });
    await this._saveTrees(trees);
    
    ui.notifications.info(`${TreeViewer.CONNECTION_TYPES[type].label} connection created`);
    this.render();
  }

  async _removeConnection(fromId, toId) {
    const trees = await this._getTrees();
    const tree = trees[this.treeId];
    
    tree.connections = tree.connections.filter(c => 
      !(c.from === fromId && c.to === toId) &&
      !(c.from === toId && c.to === fromId)
    );
    
    await this._saveTrees(trees);
    ui.notifications.info("Connection removed");
    this.render();
  }

  _drawAllConnections(html) {
    let canvas = html.hasClass('tree-canvas') ? html : html.find('.tree-canvas');
    if (!canvas.length) {
      canvas = $(this.element).find('.tree-canvas');
    }
    
    const svg = canvas.find('.connection-layer');
    
    if (!svg.length) {
      console.warn('SVG layer not found');
      return;
    }
    
    svg.empty();
    
    if (!this._data || !this._data.connections) {
      return;
    }
    
    this._data.connections.forEach(conn => {
      const fromNode = html.find(`[data-node-id="${conn.from}"]`);
      const toNode = html.find(`[data-node-id="${conn.to}"]`);
      
      if (fromNode.length && toNode.length) {
        this._drawConnection(svg, fromNode, toNode, conn.from, conn.to, conn.color);
      }
    });

    // Re-setup click handlers after redrawing
    this._setupConnectionLineHandlers(svg);
  }

  _drawConnection(svg, fromNode, toNode, fromId, toId, color = '#888888') {
    const fromRect = fromNode[0].getBoundingClientRect();
    const toRect = toNode[0].getBoundingClientRect();
    const canvasRect = svg.parent()[0].getBoundingClientRect();
    
    const x1 = fromRect.left - canvasRect.left + fromRect.width / 2;
    const y1 = fromRect.top - canvasRect.top + fromRect.height / 2;
    const x2 = toRect.left - canvasRect.left + toRect.width / 2;
    const y2 = toRect.top - canvasRect.top + toRect.height / 2;
    
    const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    line.setAttribute('x1', x1);
    line.setAttribute('y1', y1);
    line.setAttribute('x2', x2);
    line.setAttribute('y2', y2);
    line.setAttribute('class', 'connection-line');
    line.setAttribute('data-from', fromId);
    line.setAttribute('data-to', toId);
    line.setAttribute('stroke', color);
    line.setAttribute('stroke-width', '3');
    
    svg[0].appendChild(line);
  }

  _updateConnectionsForNode(nodeId, html) {
    let canvas = html.hasClass('tree-canvas') ? html : html.find('.tree-canvas');
    if (!canvas.length) {
      canvas = $(this.element).find('.tree-canvas');
    }
    
    const svg = canvas.find('.connection-layer');
    
    if (!svg.length || !this._data || !this._data.connections) {
      return;
    }
    
    this._data.connections.forEach(conn => {
      if (conn.from === nodeId || conn.to === nodeId) {
        const fromNode = html.find(`[data-node-id="${conn.from}"]`);
        const toNode = html.find(`[data-node-id="${conn.to}"]`);
        
        if (fromNode.length && toNode.length) {
          svg.find(`[data-from="${conn.from}"][data-to="${conn.to}"]`).remove();
          this._drawConnection(svg, fromNode, toNode, conn.from, conn.to, conn.color);
        }
      }
    });
  }

  async _removeNode(nodeId) {
    const trees = await this._getTrees();
    const tree = trees[this.treeId];
    
    tree.nodes = tree.nodes.filter(n => n.id !== nodeId);
    tree.connections = tree.connections.filter(c => c.from !== nodeId && c.to !== nodeId);

    await this._saveTrees(trees);
    this.render();
  }
}