# Adds the StillwaterWidget WidgetKit extension to the Capacitor Xcode project,
# wires App Groups on both targets, and embeds the extension in the app.
#
# Idempotent: re-running removes and recreates the widget target cleanly.
#
# Run with CocoaPods' bundled xcodeproj:
#   GEM_HOME="$(brew --prefix)/Cellar/cocoapods/<ver>/libexec" ruby scripts/add_widget_target.rb

require 'xcodeproj'

ROOT        = File.expand_path('..', __dir__)
PROJ_PATH   = File.join(ROOT, 'ios', 'App', 'App.xcodeproj')
APP_ID      = 'com.stillwater.app'
WIDGET_NAME = 'StillwaterWidget'
WIDGET_ID   = "#{APP_ID}.#{WIDGET_NAME}"
TEAM        = ENV['DEV_TEAM'] || 'B4U26FR445'
IOS_MIN     = '17.0'
APP_GROUP   = 'group.com.stillwater.app'

project = Xcodeproj::Project.open(PROJ_PATH)
app_target = project.targets.find { |t| t.name == 'App' } or abort 'App target not found'

# ---------------------------------------------------------------- clean slate
project.targets.select { |t| t.name == WIDGET_NAME }.each do |t|
  puts "removing existing target #{t.name}"
  t.remove_from_project
end
project.main_group.children.select { |g| g.respond_to?(:name) && g.name == WIDGET_NAME }
       .each(&:remove_from_project)
app_target.copy_files_build_phases
          .select { |p| p.name == 'Embed App Extensions' }
          .each(&:remove_from_project)
# Drop dependencies left dangling by the removed target, or add_dependency raises.
app_target.dependencies
          .select { |d| d.target.nil? || d.target.name == WIDGET_NAME }
          .each(&:remove_from_project)

# ------------------------------------------------------------- widget target
widget = project.new_target(:app_extension, WIDGET_NAME, :ios, IOS_MIN, nil, :swift)

wgroup = project.main_group.new_group(WIDGET_NAME, WIDGET_NAME)
src    = wgroup.new_reference("#{WIDGET_NAME}.swift")
widget.add_file_references([src])

# Shared model compiles into BOTH targets.
shared_group = project.main_group.find_subpath('Shared', true)
shared_group.set_source_tree('SOURCE_ROOT')
shared_group.set_path('Shared')
shared_ref = shared_group.files.find { |f| f.path == 'StillwaterShared.swift' } ||
             shared_group.new_reference('StillwaterShared.swift')
widget.add_file_references([shared_ref])
unless app_target.source_build_phase.files_references.include?(shared_ref)
  app_target.add_file_references([shared_ref])
end

# The Capacitor bridge plugin belongs to the app target only.
app_group_node = project.main_group.find_subpath('App', true)
plugin_ref = app_group_node.files.find { |f| f.path == 'StillwaterWidgetPlugin.swift' } ||
             app_group_node.new_reference('StillwaterWidgetPlugin.swift')
unless app_target.source_build_phase.files_references.include?(plugin_ref)
  app_target.add_file_references([plugin_ref])
end

# MainViewController registers the app-local plugin with the Capacitor bridge.
vc_ref = app_group_node.files.find { |f| f.path == 'MainViewController.swift' } ||
         app_group_node.new_reference('MainViewController.swift')
unless app_target.source_build_phase.files_references.include?(vc_ref)
  app_target.add_file_references([vc_ref])
end

# ------------------------------------------------------------ build settings
widget.build_configurations.each do |cfg|
  s = cfg.build_settings
  s['PRODUCT_BUNDLE_IDENTIFIER']              = WIDGET_ID
  s['PRODUCT_NAME']                           = '$(TARGET_NAME)'
  s['INFOPLIST_FILE']                         = "#{WIDGET_NAME}/Info.plist"
  s['CODE_SIGN_ENTITLEMENTS']                 = "#{WIDGET_NAME}/#{WIDGET_NAME}.entitlements"
  s['IPHONEOS_DEPLOYMENT_TARGET']             = IOS_MIN
  s['SWIFT_VERSION']                          = '5.0'
  s['TARGETED_DEVICE_FAMILY']                 = '1,2'
  s['SKIP_INSTALL']                           = 'YES'
  s['ALWAYS_EMBED_SWIFT_STANDARD_LIBRARIES']  = 'NO'
  s['CODE_SIGN_STYLE']                        = 'Automatic'
  s['DEVELOPMENT_TEAM']                       = TEAM
  s['GENERATE_INFOPLIST_FILE']                = 'NO'
  s['LD_RUNPATH_SEARCH_PATHS']                = '$(inherited) @executable_path/Frameworks @executable_path/../../Frameworks'
  s['MARKETING_VERSION']                      = '1.0'
  s['CURRENT_PROJECT_VERSION']                = '1'
  s['SWIFT_EMIT_LOC_STRINGS']                 = 'YES'
end

# App target: entitlements + team so App Groups actually resolve.
app_target.build_configurations.each do |cfg|
  s = cfg.build_settings
  s['CODE_SIGN_ENTITLEMENTS'] = 'App/App.entitlements'
  s['DEVELOPMENT_TEAM']       = TEAM
  s['CODE_SIGN_STYLE']        = 'Automatic'
end

# ------------------------------------------------- embed extension in the app
embed = app_target.new_copy_files_build_phase('Embed App Extensions')
embed.symbol_dst_subfolder_spec = :plug_ins
embed.add_file_reference(widget.product_reference, true)
app_target.add_dependency(widget)

project.save

puts "OK  #{WIDGET_NAME} (#{WIDGET_ID})  group=#{APP_GROUP}  team=#{TEAM}"
puts "    targets: #{project.targets.map(&:name).join(', ')}"
