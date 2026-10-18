module.exports = {
  presets: [
    ['module:@react-native/babel-preset', {useTransformReactJSXExperimental: true}],
  ],
  plugins: [
    ['@babel/plugin-transform-react-jsx', {runtime: 'automatic'}],
  ],
};
