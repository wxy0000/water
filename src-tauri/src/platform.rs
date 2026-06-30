// 平台特定 API
//
// 当前唯一功能：get_idle_seconds（macOS 空闲检测）
// 其他平台 stub 返回 0（不阻塞 reminder）

/// 距离最后一次键鼠事件的秒数
///
/// macOS: CGEventSourceSecondsSinceLastEventType (ApplicationServices framework)
/// 其他平台: 返回 0（reminder 不会被"空闲"过滤掉）
pub fn get_idle_seconds() -> u64 {
    #[cfg(target_os = "macos")]
    {
        macos_idle_seconds()
    }
    #[cfg(not(target_os = "macos"))]
    {
        0
    }
}

#[cfg(target_os = "macos")]
fn macos_idle_seconds() -> u64 {
    extern "C" {
        fn CGEventSourceSecondsSinceLastEventType(state: u32, event_type: u32) -> f64;
    }

    unsafe {
        // kCGEventSourceStateHIDSystemState = -1 = 0xFFFFFFFF
        // kCGAnyInputEventType = 0xFFFFFFFF（任何鼠标/键盘事件）
        CGEventSourceSecondsSinceLastEventType(u32::MAX, u32::MAX) as u64
    }
}
