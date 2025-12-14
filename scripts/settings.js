CONFIG.debug.hooks = false;
Hooks.once('init', function() {
  // API Provider setting
  game.settings.register('ironic-relational-trees', 'trees', {
    name: 'API Provider',
    hint: 'Choose between OpenAI and OpenRouter.',
    scope: 'world',
    config: false,
    type: Object,
    default: {}
  });

});