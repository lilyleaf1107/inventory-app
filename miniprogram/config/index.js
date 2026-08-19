const path = require('path')

const config = {
  projectName: 'inventory-miniprogram',
  date: '2026-8-16',
  designWidth: 750,
  deviceRatio: {
    640: 2.34 / 2,
    750: 1,
    828: 1.81 / 2,
  },
  sourceRoot: 'src',
  outputRoot: 'dist',
  plugins: [],
  defineConstants: {},
  alias: {
    '@': path.resolve(__dirname, '..', 'src'),
    // 用空壳替换真实的 @supabase/realtime-js，避免 RealtimeClient 构造时 new URL 走到 Taro 内部 URL 校验
    '@supabase/realtime-js': path.resolve(__dirname, '..', 'src', 'lib', 'realtime-mock.ts'),
    '@supabase/realtime-js/dist/module/RealtimeClient': path.resolve(__dirname, '..', 'src', 'lib', 'realtime-mock.ts'),
    '@supabase/realtime-js/dist/main/RealtimeClient': path.resolve(__dirname, '..', 'src', 'lib', 'realtime-mock.ts'),
  },
  copy: {
    patterns: [],
    options: {},
  },
  framework: 'react',
  compiler: 'webpack5',
  cache: {
    enable: false,
  },
  mini: {
    // 禁用 Taro 自带的 Web API polyfill，让小程序端走我们自定义的兼容补丁
    polyfill: {
      enable: false,
    },
    // 运行时不注入 URL 等对象
    runtime: {
      enableOuterURL: false,
      enableExtractUrl: false,
    },
    postcss: {
      pxtransform: {
        enable: true,
        config: {},
      },
      cssModules: {
        enable: false,
      },
    },
  },
  h5: {
    publicPath: '/',
    staticDirectory: 'static',
    postcss: {
      autoprefixer: {
        enable: true,
        config: {},
      },
      cssModules: {
        enable: false,
      },
    },
  },
}

module.exports = function (merge) {
  if (process.env.NODE_ENV === 'development') {
    return merge({}, config, require('./dev'))
  }
  return merge({}, config, require('./prod'))
}
