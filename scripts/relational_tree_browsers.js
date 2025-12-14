class RelationalTreeBrowser extends Application {
  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      id: "relational-tree-browser",
      title: "Relational Trees",
      template: "modules/ironic-relational-tree/templates/tree-browser.hbs",
      width: 600,
      height: 400,
      classes: ["relational-tree-browser"]
    });
  }

  getData() {
    return {
      categories: [
        { id: "family", name: "Family Trees", icon: "fas fa-sitemap" },
        { id: "factions", name: "Factions", icon: "fas fa-flag" },
        { id: "extras", name: "Extras", icon: "fas fa-star" }
      ]
    };
  }

  activateListeners(html) {
    super.activateListeners(html);
    
    html.find('.category-button').click((event) => {
      const category = $(event.currentTarget).data('category');
      new TreeList(category).render(true);
      this.close();
    });
  }
}