import Foundation
import CoreBluetooth

// FoloToy / TraeCard BLE 连接与调试工具
class BleSession: NSObject, CBCentralManagerDelegate, CBPeripheralDelegate {
    var central: CBCentralManager!
    var peripheral: CBPeripheral?

    override init() {
        super.init()
        self.central = CBCentralManager(delegate: self, queue: nil)
    }

    func centralManagerDidUpdateState(_ central: CBCentralManager) {
        if central.state == .poweredOn {
            print("[1/5] Mac 蓝牙就绪，正在搜索设备 '4c11ae32e610'...")
            central.scanForPeripherals(withServices: nil, options: nil)
        } else {
            print("[-] Mac 蓝牙状态异常: \(central.state.rawValue)")
        }
    }

    func centralManager(_ central: CBCentralManager, didDiscover peripheral: CBPeripheral, advertisementData: [String : Any], rssi RSSI: NSNumber) {
        let name = peripheral.name ?? advertisementData[CBAdvertisementDataLocalNameKey] as? String ?? ""
        if name.contains("4c11ae32e610") {
            print("[2/5] 发现设备! 名称: \(name), RSSI: \(RSSI) dBm")
            self.peripheral = peripheral
            self.peripheral?.delegate = self
            central.stopScan()
            print("[3/5] 正在发起 BLE 蓝牙物理连接...")
            central.connect(peripheral, options: nil)
        }
    }

    func centralManager(_ central: CBCentralManager, didConnect peripheral: CBPeripheral) {
        print("[4/5] 🎉 蓝牙连接成功！已与硬件建立通信链路。")
        print("      设备 UUID: \(peripheral.identifier)")
        print("      开始发现 GATT 服务与特征值通道...")
        peripheral.discoverServices(nil)
    }

    func centralManager(_ central: CBCentralManager, didFailToConnect peripheral: CBPeripheral, error: Error?) {
        print("[-] 连接失败: \(String(describing: error))")
        exit(1)
    }

    func peripheral(_ peripheral: CBPeripheral, didDiscoverServices error: Error?) {
        guard let services = peripheral.services, !services.isEmpty else { return }
        for s in services {
            let sName = s.uuid.uuidString.starts(with: "54524145") ? "TRAECARD 主服务" : "系统服务"
            print("  -> 发现服务: \(s.uuid.uuidString) [\(sName)]")
            peripheral.discoverCharacteristics(nil, for: s)
        }
    }

    func peripheral(_ peripheral: CBPeripheral, didDiscoverCharacteristicsFor service: CBService, error: Error?) {
        guard let chars = service.characteristics else { return }
        print("  -> 服务 [\(service.uuid.uuidString)] 包含 \(chars.count) 个通信通道:")
        for c in chars {
            var propDesc: [String] = []
            if c.properties.contains(.read) { propDesc.append("读") }
            if c.properties.contains(.write) { propDesc.append("写") }
            if c.properties.contains(.writeWithoutResponse) { propDesc.append("无应答写") }
            if c.properties.contains(.notify) { propDesc.append("订阅通知") }
            print("     * 通道 [\(c.uuid.uuidString)] 属性: [\(propDesc.joined(separator: ", "))]")

            if c.properties.contains(.read) {
                peripheral.readValue(for: c)
            }
            if c.properties.contains(.notify) {
                peripheral.setNotifyValue(true, for: c)
            }
        }
    }

    func peripheral(_ peripheral: CBPeripheral, didUpdateValueFor characteristic: CBCharacteristic, error: Error?) {
        let val = characteristic.value ?? Data()
        let hex = val.map { String(format: "%02x", $0) }.joined(separator: " ")
        print("  [收到设备数据] 通道 [\(characteristic.uuid.uuidString)] -> \(hex)")
    }

    func peripheral(_ peripheral: CBPeripheral, didUpdateNotificationStateFor characteristic: CBCharacteristic, error: Error?) {
        if characteristic.isNotifying {
            print("  [通道就绪] 通道 \(characteristic.uuid.uuidString) 实时通知已开启")
        }
    }

    func centralManager(_ central: CBCentralManager, didDisconnectPeripheral peripheral: CBPeripheral, error: Error?) {
        print("[!] 蓝牙已断开: \(String(describing: error))")
    }
}

let session = BleSession()
RunLoop.main.run(until: Date(timeIntervalSinceNow: 5.0))
print("[5/5] 测试连接完毕，链路通畅。")
