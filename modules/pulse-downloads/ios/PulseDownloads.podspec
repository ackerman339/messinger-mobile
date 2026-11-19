Pod::Spec.new do |s|
  s.name           = 'PulseDownloads'
  s.version        = '1.0.0'
  s.summary        = 'Guarda archivos de Pulse en Archivos'
  s.homepage       = 'https://expo.dev'
  s.license        = { :type => 'Proprietary' }
  s.author         = 'Pulse'
  s.platforms      = { :ios => '15.1' }
  s.source         = { :git => '' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'
  s.source_files = '**/*.swift'
end
