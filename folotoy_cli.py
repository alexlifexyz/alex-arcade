#!/usr/bin/env python3
"""
FoloToy 设备 USB 串口控制工具
用法:
  python3 folotoy_cli.py info         # 查看设备当前配置与状态
  python3 folotoy_cli.py monitor      # 实时查看串口日志 (Ctrl+C 退出)
  python3 folotoy_cli.py set-volume 80 # 设置音量 (0-100)
  python3 folotoy_cli.py set-standby 300 # 设置休眠时间 (秒, 0=永不休眠)
  python3 folotoy_cli.py reboot       # 重启设备
  python3 folotoy_cli.py reset-binding # 重置绑定状态
"""

import glob
import os
import select
import sys
import termios
import time

def find_serial_port():
    ports = glob.glob('/dev/cu.usbmodem*') + glob.glob('/dev/cu.usbserial*') + glob.glob('/dev/cu.wchusbserial*')
    return ports[0] if ports else None

def open_serial(port, baudrate=115200):
    fd = os.open(port, os.O_RDWR | os.O_NOCTTY | os.O_NONBLOCK)
    attrs = termios.tcgetattr(fd)
    attrs[0] = 0  # iflag
    attrs[1] = 0  # oflag
    attrs[2] = termios.CS8 | termios.CREAD | termios.CLOCAL  # cflag
    attrs[3] = 0  # lflag
    attrs[4] = termios.B115200  # ispeed
    attrs[5] = termios.B115200  # ospeed
    termios.tcsetattr(fd, termios.TCSANOW, attrs)
    return fd

def send_cmd(port, cmd, timeout=1.0):
    fd = open_serial(port)
    time.sleep(0.05)
    try:
        os.read(fd, 4096)
    except Exception:
        pass
    os.write(fd, (cmd + '\r\n').encode())
    time.sleep(0.15)
    res = b''
    start = time.time()
    while time.time() - start < timeout:
        r, _, _ = select.select([fd], [], [], 0.2)
        if r:
            try:
                res += os.read(fd, 4096)
            except Exception:
                break
        elif res:
            break
    os.close(fd)
    return res.decode('utf-8', errors='replace').strip()

def monitor(port):
    print(f"[*] 正在监听 {port} (115200 bps)，按 Ctrl+C 退出...")
    fd = open_serial(port)
    try:
        while True:
            r, _, _ = select.select([fd], [], [], 1.0)
            if r:
                data = os.read(fd, 1024)
                if not data:
                    print("\n[!] 设备断开连接")
                    break
                sys.stdout.write(data.decode('utf-8', errors='replace'))
                sys.stdout.flush()
    except KeyboardInterrupt:
        print("\n[*] 退出串口监控")
    finally:
        os.close(fd)

def show_info(port):
    cfg = send_cmd(port, "at+config=?")
    card = send_cmd(port, "AT+CARDID?")
    print("=" * 45)
    print("           FoloToy 设备信息")
    print("=" * 45)
    print(f"串口端口: {port}")
    print(f"配置状态: {cfg}")
    print(f"卡片状态: {card}")
    print("=" * 45)

def main():
    port = find_serial_port()
    if not port:
        print("[错误] 未找到连接的 USB 串口设备，请检查 USB 线缆连接。")
        sys.exit(1)

    if len(sys.argv) < 2:
        show_info(port)
        return

    cmd = sys.argv[1].lower()
    if cmd == "info":
        show_info(port)
    elif cmd == "monitor":
        monitor(port)
    elif cmd == "set-volume" and len(sys.argv) >= 3:
        vol = sys.argv[2]
        resp = send_cmd(port, f"at+config=common,volume,{vol}")
        print(f"设置音量为 {vol}: {resp}")
    elif cmd == "set-standby" and len(sys.argv) >= 3:
        st = sys.argv[2]
        resp = send_cmd(port, f"at+config=common,standby_time,{st}")
        print(f"设置休眠时间为 {st} 秒: {resp}")
    elif cmd == "reboot":
        resp = send_cmd(port, "at+command=restart,now")
        print(f"重启指令发送: {resp}")
    elif cmd == "reset-binding":
        resp = send_cmd(port, "at+command=binding,reset")
        print(f"重置绑定指令发送: {resp}")
    else:
        print(f"未知命令: {cmd}")
        print(__doc__)

if __name__ == '__main__':
    main()
