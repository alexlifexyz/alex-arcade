/**
 * levels.js
 * 《沉浸式桌面收纳家》5 大主题关卡网格与收纳物品定义
 * 每个关卡均设计了数学上严丝合缝的 100% 空间利用解法
 */
(function(root, factory) {
  if (typeof define === 'function' && define.amd) {
    define([], factory);
  } else if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.TIDY_LEVELS = factory();
  }
})(typeof self !== 'undefined' ? self : this, function() {
  "use strict";

  const LEVELS = [
    {
      id: 1,
      name: "少女粉梳妆台",
      subtitle: "治愈系晨间梳妆收纳 · 少女的精致角落",
      theme: {
        bg: "#fdf2f4",
        containerBg: "#fff5f7",
        containerBorder: "#fbcfe8",
        gridLine: "rgba(244, 114, 182, 0.2)",
        tagBg: "rgba(244, 114, 182, 0.15)",
        tagFg: "#db2777"
      },
      cols: 6,
      rows: 6,
      // 6x6 = 36 格
      items: [
        {
          id: "lipsticks",
          name: "鎏金正红口红对管",
          shape: [[1, 1], [1, 1]], // 2x2 = 4
          color: "#be123c",
          accentColor: "#fbbf24",
          detailType: "lipstick",
          solution: { col: 0, row: 0, rot: 0 }
        },
        {
          id: "perfume",
          name: "水晶香水方瓶",
          shape: [[1, 1], [1, 1]], // 2x2 = 4
          color: "#c084fc",
          accentColor: "#f472b6",
          detailType: "perfume",
          solution: { col: 2, row: 0, rot: 0 }
        },
        {
          id: "cushion",
          name: "雕花气垫高光粉饼",
          shape: [[1, 1], [1, 1]], // 2x2 = 4
          color: "#fbcfe8",
          accentColor: "#f43f5e",
          detailType: "powder",
          solution: { col: 4, row: 0, rot: 0 }
        },
        {
          id: "brushes",
          name: "毛绒软毛化妆刷桶",
          shape: [[1, 1], [1, 1]], // 2x2 = 4
          color: "#fda4af",
          accentColor: "#78350f",
          detailType: "brush",
          solution: { col: 0, row: 2, rot: 0 }
        },
        {
          id: "eyeliner",
          name: "极细持妆眼线笔",
          shape: [[1, 1, 1, 1]], // 4x1 = 4
          color: "#374151",
          accentColor: "#f59e0b",
          detailType: "eyeliner",
          solution: { col: 2, row: 2, rot: 0 }
        },
        {
          id: "sunscreen",
          name: "水光防晒霜软管",
          shape: [[1, 1, 1, 1]], // 4x1 = 4
          color: "#6ee7b7",
          accentColor: "#059669",
          detailType: "tube",
          solution: { col: 2, row: 3, rot: 0 }
        },
        {
          id: "lipbalm",
          name: "润唇膏小方管",
          shape: [[1, 1]], // 2x1 = 2
          color: "#f472b6",
          accentColor: "#ec4899",
          detailType: "lipbalm",
          solution: { col: 0, row: 4, rot: 0 }
        },
        {
          id: "sponge",
          name: "蜜桃美妆蛋小盒",
          shape: [[1, 1]], // 2x1 = 2
          color: "#fb7185",
          accentColor: "#ffe4e6",
          detailType: "sponge",
          solution: { col: 0, row: 5, rot: 0 }
        },
        {
          id: "mirror",
          name: "便携复古手柄折叠镜",
          shape: [[1, 1, 1, 1], [1, 1, 1, 1]], // 4x2 = 8
          color: "#fef3c7",
          accentColor: "#d97706",
          detailType: "mirror",
          solution: { col: 2, row: 4, rot: 0 }
        }
      ]
    },
    {
      id: 2,
      name: "极简日系文具盒",
      subtitle: "双层收纳木盒 · 书写桌面的秩序美学",
      theme: {
        bg: "#f8fafc",
        containerBg: "#f1f5f9",
        containerBorder: "#cbd5e1",
        gridLine: "rgba(100, 116, 139, 0.2)",
        tagBg: "rgba(100, 116, 139, 0.15)",
        tagFg: "#475569"
      },
      cols: 7,
      rows: 5,
      // 7x5 = 35 格
      items: [
        {
          id: "fountain_pen",
          name: "深空灰极简钢笔",
          shape: [[1, 1, 1, 1, 1]], // 5x1 = 5
          color: "#1e293b",
          accentColor: "#94a3b8",
          detailType: "pen",
          solution: { col: 0, row: 0, rot: 0 }
        },
        {
          id: "highlighter",
          name: "温润奶黄荧光笔",
          shape: [[1, 1, 1, 1, 1]], // 5x1 = 5
          color: "#fde047",
          accentColor: "#eab308",
          detailType: "pen",
          solution: { col: 0, row: 1, rot: 0 }
        },
        {
          id: "ruler",
          name: "磨砂透明亚克力直尺",
          shape: [[1, 1, 1, 1, 1]], // 5x1 = 5
          color: "#e2e8f0",
          accentColor: "#64748b",
          detailType: "ruler",
          solution: { col: 0, row: 2, rot: 0 }
        },
        {
          id: "cutter",
          name: "自锁式黑曜美工刀",
          shape: [[1, 1, 1, 1, 1]], // 5x1 = 5
          color: "#334155",
          accentColor: "#f87171",
          detailType: "cutter",
          solution: { col: 0, row: 3, rot: 0 }
        },
        {
          id: "postit",
          name: "牛皮纸方格便签纸",
          shape: [[1, 1], [1, 1], [1, 1]], // 2x3 = 6
          color: "#fef08a",
          accentColor: "#ca8a04",
          detailType: "notepad",
          solution: { col: 5, row: 0, rot: 0 }
        },
        {
          id: "paperclips",
          name: "彩虹回形针收纳盒",
          shape: [[1, 1], [1, 1]], // 2x2 = 4
          color: "#93c5fd",
          accentColor: "#3b82f6",
          detailType: "clips",
          solution: { col: 5, row: 3, rot: 0 }
        },
        {
          id: "eraser",
          name: "纯白无屑美术橡皮",
          shape: [[1, 1, 1]], // 3x1 = 3
          color: "#f8fafc",
          accentColor: "#2563eb",
          detailType: "eraser",
          solution: { col: 0, row: 4, rot: 0 }
        },
        {
          id: "tape",
          name: "和纸胶带小圈",
          shape: [[1, 1]], // 2x1 = 2
          color: "#86efac",
          accentColor: "#16a34a",
          detailType: "tape",
          solution: { col: 3, row: 4, rot: 0 }
        }
      ]
    },
    {
      id: 3,
      name: "随身急救小药箱",
      subtitle: "居家常备收纳 · 井井有条的安心守候",
      theme: {
        bg: "#f0fdf4",
        containerBg: "#dcfce7",
        containerBorder: "#86efac",
        gridLine: "rgba(34, 197, 94, 0.2)",
        tagBg: "rgba(34, 197, 94, 0.15)",
        tagFg: "#15803d"
      },
      cols: 6,
      rows: 6,
      // 6x6 = 36 格
      items: [
        {
          id: "capsule_pack",
          name: "双色胶囊药板",
          shape: [[1, 1, 1], [1, 1, 1]], // 3x2 = 6
          color: "#e0e7ff",
          accentColor: "#ef4444",
          detailType: "capsules",
          solution: { col: 0, row: 0, rot: 0 }
        },
        {
          id: "iodine_box",
          name: "碘伏消毒棉签筒",
          shape: [[1, 1], [1, 1]], // 2x2 = 4
          color: "#b45309",
          accentColor: "#fef3c7",
          detailType: "iodine",
          solution: { col: 3, row: 0, rot: 0 }
        },
        {
          id: "eye_drops",
          name: "舒缓薄荷滴眼液",
          shape: [[1], [1]], // 1x2 = 2
          color: "#38bdf8",
          accentColor: "#0284c7",
          detailType: "eyedrops",
          solution: { col: 5, row: 0, rot: 0 }
        },
        {
          id: "thermometer",
          name: "数显快速体温计",
          shape: [[1, 1, 1, 1]], // 4x1 = 4
          color: "#f8fafc",
          accentColor: "#06b6d4",
          detailType: "thermometer",
          solution: { col: 0, row: 2, rot: 0 }
        },
        {
          id: "bandaids",
          name: "卡通透气创可贴组",
          shape: [[1, 1]], // 2x1 = 2
          color: "#fed7aa",
          accentColor: "#ea580c",
          detailType: "bandaids",
          solution: { col: 4, row: 2, rot: 0 }
        },
        {
          id: "ointment",
          name: "舒缓凝胶药膏软管",
          shape: [[1, 1, 1, 1]], // 4x1 = 4
          color: "#a7f3d0",
          accentColor: "#059669",
          detailType: "ointment",
          solution: { col: 0, row: 3, rot: 0 }
        },
        {
          id: "pills_bottle",
          name: "维生素咀嚼片瓶",
          shape: [[1, 1]], // 2x1 = 2
          color: "#fef08a",
          accentColor: "#f59e0b",
          detailType: "bottle",
          solution: { col: 4, row: 3, rot: 0 }
        },
        {
          id: "gauze_pack",
          name: "灭菌纯棉纱布包",
          shape: [[1, 1, 1], [1, 1, 1]], // 3x2 = 6
          color: "#ffffff",
          accentColor: "#3b82f6",
          detailType: "gauze",
          solution: { col: 0, row: 4, rot: 0 }
        },
        {
          id: "motion_patch",
          name: "草本清凉贴小包",
          shape: [[1, 1, 1], [1, 1, 1]], // 3x2 = 6
          color: "#bbf7d0",
          accentColor: "#16a34a",
          detailType: "patch",
          solution: { col: 3, row: 4, rot: 0 }
        }
      ]
    },
    {
      id: 4,
      name: "周末出发旅行箱",
      subtitle: "行李箱整装待发 · 收拾好心情奔赴远方",
      theme: {
        bg: "#eff6ff",
        containerBg: "#dbeafe",
        containerBorder: "#93c5fd",
        gridLine: "rgba(59, 130, 246, 0.2)",
        tagBg: "rgba(59, 130, 246, 0.15)",
        tagFg: "#1d4ed8"
      },
      cols: 6,
      rows: 7,
      // 6x7 = 42 格
      items: [
        {
          id: "folded_clothes",
          name: "折叠棉质卫衣块",
          shape: [[1, 1, 1], [1, 1, 1], [1, 1, 1]], // 3x3 = 9
          color: "#94a3b8",
          accentColor: "#475569",
          detailType: "clothes",
          solution: { col: 0, row: 0, rot: 0 }
        },
        {
          id: "retro_camera",
          name: "复古微单胶片相机",
          shape: [[1, 1], [1, 1]], // 2x2 = 4
          color: "#18181b",
          accentColor: "#d4d4d8",
          detailType: "camera",
          solution: { col: 3, row: 0, rot: 0 }
        },
        {
          id: "passport_wallet",
          name: "护照与登机牌夹",
          shape: [[1], [1]], // 1x2 = 2
          color: "#1e3a8a",
          accentColor: "#fbbf24",
          detailType: "passport",
          solution: { col: 5, row: 0, rot: 0 }
        },
        {
          id: "sunglasses_box",
          name: "便携折叠墨镜盒",
          shape: [[1, 1, 1]], // 3x1 = 3
          color: "#78350f",
          accentColor: "#d97706",
          detailType: "glasses",
          solution: { col: 3, row: 2, rot: 0 }
        },
        {
          id: "headphones",
          name: "头戴式降噪大耳机",
          shape: [[1, 1, 1], [1, 1, 1]], // 3x2 = 6
          color: "#f1f5f9",
          accentColor: "#334155",
          detailType: "headphones",
          solution: { col: 0, row: 3, rot: 0 }
        },
        {
          id: "toiletry_bag",
          name: "半透明洗漱收纳包",
          shape: [[1, 1, 1], [1, 1, 1]], // 3x2 = 6
          color: "#bae6fd",
          accentColor: "#0284c7",
          detailType: "toiletry",
          solution: { col: 3, row: 3, rot: 0 }
        },
        {
          id: "powerbank",
          name: "快充大容量充电宝",
          shape: [[1, 1]], // 2x1 = 2
          color: "#cbd5e1",
          accentColor: "#10b981",
          detailType: "powerbank",
          solution: { col: 0, row: 5, rot: 0 }
        },
        {
          id: "adapter_cable",
          name: "多功能数据线收纳圈",
          shape: [[1]], // 1x1 = 1
          color: "#fb923c",
          accentColor: "#ea580c",
          detailType: "cable",
          solution: { col: 2, row: 5, rot: 0 }
        },
        {
          id: "umbrella",
          name: "超轻晴雨两用折叠伞",
          shape: [[1, 1, 1]], // 3x1 = 3
          color: "#15803d",
          accentColor: "#86efac",
          detailType: "umbrella",
          solution: { col: 3, row: 5, rot: 0 }
        },
        {
          id: "souvenirs",
          name: "旅行纪念明信片册",
          shape: [[1, 1, 1, 1, 1, 1]], // 6x1 = 6
          color: "#fed7aa",
          accentColor: "#f97316",
          detailType: "postcards",
          solution: { col: 0, row: 6, rot: 0 }
        }
      ]
    },
    {
      id: 5,
      name: "清凉夏日保鲜格",
      subtitle: "冰箱冷藏抽屉 · 锁住盛夏清爽香甜",
      theme: {
        bg: "#f0fdfa",
        containerBg: "#ccfbf1",
        containerBorder: "#5eead4",
        gridLine: "rgba(20, 184, 166, 0.2)",
        tagBg: "rgba(20, 184, 166, 0.15)",
        tagFg: "#0f766e"
      },
      cols: 6,
      rows: 6,
      // 6x6 = 36 格
      items: [
        {
          id: "strawberry_box",
          name: "鲜甜丹东红草莓盒",
          shape: [[1, 1, 1], [1, 1, 1]], // 3x2 = 6
          color: "#ef4444",
          accentColor: "#22c55e",
          detailType: "strawberries",
          solution: { col: 0, row: 0, rot: 0 }
        },
        {
          id: "soda_can",
          name: "海盐青柠冰苏打水",
          shape: [[1], [1]], // 1x2 = 2
          color: "#38bdf8",
          accentColor: "#facc15",
          detailType: "can",
          solution: { col: 3, row: 0, rot: 0 }
        },
        {
          id: "lemon_slices",
          name: "蜂蜜柠檬鲜切罐",
          shape: [[1, 1], [1, 1]], // 2x2 = 4
          color: "#fef08a",
          accentColor: "#eab308",
          detailType: "lemon",
          solution: { col: 4, row: 0, rot: 0 }
        },
        {
          id: "yogurt_bottles",
          name: "双拼浓郁希腊酸奶",
          shape: [[1, 1], [1, 1]], // 2x2 = 4
          color: "#ffffff",
          accentColor: "#0284c7",
          detailType: "yogurt",
          solution: { col: 0, row: 2, rot: 0 }
        },
        {
          id: "cheese_triangle",
          name: "经典多孔瑞士奶酪",
          shape: [[1, 1]], // 2x1 = 2
          color: "#facc15",
          accentColor: "#ca8a04",
          detailType: "cheese",
          solution: { col: 2, row: 2, rot: 0 }
        },
        {
          id: "pudding",
          name: "焦糖红樱桃布丁",
          shape: [[1, 1]], // 2x1 = 2
          color: "#fcd34d",
          accentColor: "#dc2626",
          detailType: "pudding",
          solution: { col: 2, row: 3, rot: 0 }
        },
        {
          id: "cola_can",
          name: "极冻经典红可乐",
          shape: [[1], [1]], // 1x2 = 2
          color: "#dc2626",
          accentColor: "#ffffff",
          detailType: "can",
          solution: { col: 4, row: 2, rot: 0 }
        },
        {
          id: "iced_tea",
          name: "冰萃茉莉绿茶罐",
          shape: [[1], [1]], // 1x2 = 2
          color: "#86efac",
          accentColor: "#15803d",
          detailType: "can",
          solution: { col: 5, row: 2, rot: 0 }
        },
        {
          id: "watermelon_box",
          name: "无籽甜瓜鲜切大盒",
          shape: [[1, 1, 1, 1], [1, 1, 1, 1]], // 4x2 = 8
          color: "#f87171",
          accentColor: "#16a34a",
          detailType: "watermelon",
          solution: { col: 0, row: 4, rot: 0 }
        },
        {
          id: "blueberries",
          name: "高山大果粒蓝莓杯",
          shape: [[1, 1], [1, 1]], // 2x2 = 4
          color: "#818cf8",
          accentColor: "#312e81",
          detailType: "blueberries",
          solution: { col: 4, row: 4, rot: 0 }
        }
      ]
    }
  ];

  return LEVELS;
});
