// 桌面浮窗状态 DAO（前端）
import { commands } from '@/lib/tauri';

export const widget = {
  /** 读上次保存的位置 [x, y]（启动时由 Rust 端在 widget 窗口创建前调） */
  getPos: (): Promise<[number, number]> => commands.getWidgetPos(),

  /** 拖动结束保存位置（03 阶段：占位；04 阶段 widget.rs 在窗口 onMove 时调） */
  savePos: (x: number, y: number): Promise<void> => commands.saveWidgetPos(x, y),

  /** 设置中关掉浮窗（隐藏 / 显示） */
  setVisible: (visible: boolean): Promise<void> => commands.setWidgetVisible(visible),
};
