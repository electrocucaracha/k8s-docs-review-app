export default {
  extends: ["stylelint-config-standard"],
  rules: {
    // Components and responsive overrides intentionally use independent cascades.
    "no-descending-specificity": null,
    // CodeMirror owns these camelCase class names.
    "selector-class-pattern": [
      "^(cm-[a-zA-Z0-9-]+|[a-z][a-z0-9]*(-[a-z0-9]+)*)$",
    ],
  },
};
