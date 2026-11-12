const { withMainActivity } = require('@expo/config-plugins');

const IMMERSIVE_METHOD = `
  private fun enableImmersiveMode() {
    window.decorView.systemUiVisibility = (
      android.view.View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY
        or android.view.View.SYSTEM_UI_FLAG_FULLSCREEN
        or android.view.View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
        or android.view.View.SYSTEM_UI_FLAG_LAYOUT_STABLE
        or android.view.View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION
        or android.view.View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN
    )
  }

  override fun onWindowFocusChanged(hasFocus: Boolean) {
    super.onWindowFocusChanged(hasFocus)
    if (hasFocus) {
      enableImmersiveMode()
    }
  }
`;

module.exports = function withImmersiveMode(config) {
  return withMainActivity(config, (config) => {
    let contents = config.modResults.contents;

    // Keep the plugin idempotent when Expo Prebuild runs more than once.
    if (!contents.includes('private fun enableImmersiveMode()')) {
      contents = contents.replace(
        /super\\.onCreate\\(null\\)/,
        'super.onCreate(null)\\n    enableImmersiveMode()'
      );

      const classEnd = contents.lastIndexOf('}');
      if (classEnd < 0) {
        throw new Error('Could not locate the end of MainActivity.kt');
      }
      contents = contents.slice(0, classEnd) + IMMERSIVE_METHOD + contents.slice(classEnd);
    }

    config.modResults.contents = contents;
    return config;
  });
};
