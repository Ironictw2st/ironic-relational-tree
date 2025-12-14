// In your new module
Hooks.on('getSceneControlButtons', (controls) => {
  // Access the ironic_options control directly as a property
  if (controls.ironic_options) {
    // Add your new tools to the existing control
    controls.ironic_options.tools.push({
      name: "ironic-relational-trees",
      title: "Relational Trees",
      icon: "fas fa-sitemap",
    });
    
  }

    window.RelationalTreeBrowser = RelationalTreeBrowser;
    window.TreeList = TreeList;
    window.TreeViewer = TreeViewer;

});

Hooks.on('renderSceneControls', (controls, html, data) => {
  const $html = $(html);
  
  $html.find('[data-tool="ironic-relational-trees"]').click((event) => {
    event.preventDefault();
    event.stopPropagation();
    new RelationalTreeBrowser().render(true);
  });
});

