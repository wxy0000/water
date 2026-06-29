fn main() {
    println!("cargo:rustc-check-cfg=cfg(feature, values(\"cargo-clippy\"))");
    println!("cargo:rerun-if-changed=src/native_notify_macos.m");

    // macOS：编译 UserNotifications.framework 桥，提供带动作按钮的系统通知。
    #[cfg(target_os = "macos")]
    {
        cc::Build::new()
            .file("src/native_notify_macos.m")
            .flag("-fobjc-arc")
            .compile("native_notify_macos");

        println!("cargo:rustc-link-lib=framework=Foundation");
        println!("cargo:rustc-link-lib=framework=UserNotifications");
    }

    tauri_build::build();
}
