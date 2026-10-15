// simulator/catalog.js — Alex Arcade 唯一游戏目录
// 大厅、游戏页、封面都只读这里。任务 test(stats) 的字段由各游戏在 api.stats 上实时写入。
(function (G) {
  'use strict';

  G.CATEGORIES = [
    { id: 'all', label: '全部' },
    { id: 'shoot', label: '射击' },
    { id: 'action', label: '动作' },
    { id: 'race', label: '竞速' },
    { id: 'puzzle', label: '益智' },
    { id: 'rhythm', label: '节奏' },
    { id: 'casual', label: '休闲' }
  ];

  G.CATALOG = [
    // ---------------- 主打（重制） ----------------
    {
      id: 'thunder', title: '雷霆战机', en: 'Thunder Striker', icon: '✈️', cat: 'shoot', color: '#38e1ff', featured: true, remade: true,
      pitch: '自动开火，擦弹攒炸弹，金币连锁越吃越值钱',
      desc: '竖版弹幕射击。战机自动开火，你只管左右走位。子弹贴身擦过会充能炸弹，击落敌机掉落的金币不断链就越来越值钱，每一关尽头都有会变招的 BOSS。',
      controls: { up: '向左移动', down: '向右移动', ok: '投放炸弹（清屏）' },
      tips: ['只有机身中央的小亮点才是判定点，大胆贴着子弹走。', '擦弹条满了自动送一颗炸弹。', '金币落地前接住才不断链，链越长单价越高。'],
      missions: [
        { text: '击败第一个 BOSS', test: (st) => st.bosses >= 1 },
        { text: '单局擦弹 40 次', test: (st) => st.graze >= 40 },
        { text: '金币单价涨到 1000', test: (st) => st.medal >= 1000 }
      ],
      ranks: [80000, 35000, 12000]
    },
    {
      id: 'thunderracer', title: '雷霆飞车', en: 'Thunder Racer', icon: '🏎️', cat: 'race', color: '#ff5a5a', featured: true, remade: true,
      pitch: '限时冲关，擦车攒氮气，弯道别被甩出去',
      desc: '伪 3D 公路狂飙。倒计时归零就结束，冲过检查点续时间。贴着车流擦过去会攒氮气，弯道离心力会把车往外甩，冲出路面会减速。',
      controls: { up: '向左转向', down: '向右转向', ok: '按住开氮气' },
      tips: ['入弯前提前往内侧打方向。', '擦车越近奖励越多，还会回氮气。', '开氮气时撞车不会减速太多，但会扣时间。'],
      missions: [
        { text: '通过 3 个检查点', test: (st) => st.checkpoints >= 3 },
        { text: '单局擦车 15 次', test: (st) => st.nearMiss >= 15 },
        { text: '时速突破 320 km/h', test: (st) => st.topSpeed >= 320 }
      ],
      ranks: [60000, 30000, 12000]
    },
    {
      id: 'battlecity', title: '坦克大战', en: 'Tank 1990', icon: '🪖', cat: 'shoot', color: '#ffd23f', featured: true, remade: true,
      pitch: '三键开坦克：自动前进，左右拐弯，按住原地连射',
      desc: '保卫基地老鹰。坦克自己往前开，UP / DOWN 在下一个路口左拐或右拐，OK 开炮，按住 OK 原地停车连射。打掉闪光坦克会掉道具，星星能把炮升到打穿钢板。',
      controls: { up: '左转', down: '右转', ok: '开炮 · 按住停车连射' },
      tips: ['转向会自动对齐到格子，提前按就行。', '老鹰被打掉直接结束，别让敌人绕到下面。', '铲子道具会把基地围墙换成钢板。'],
      missions: [
        { text: '守住第 1 关', test: (st) => st.stage >= 2 },
        { text: '单局击毁 30 辆坦克', test: (st) => st.kills >= 30 },
        { text: '把主炮升到满级', test: (st) => st.tier >= 3 }
      ],
      ranks: [30000, 15000, 6000]
    },
    {
      id: 'adventure', title: '冒险岛', en: 'Adventure Island', icon: '🏝️', cat: 'action', color: '#6ee06e', featured: true, remade: true,
      pitch: '一路狂奔，体力一直掉，吃水果续命',
      desc: '自动奔跑的横版冒险。体力条会一直往下掉，吃水果才能续上。蛋里有石斧和滑板，按住 OK 跳得更高，DOWN 冲刺更快但更耗体力。每跑完一段就有旗子存档。',
      controls: { up: '扔石斧', down: '按住冲刺', ok: '跳跃（按住跳更高）' },
      tips: ['蛋要踢两下：先碰开，再拿道具。', '滑板能多挡一次伤害。', '火堆打不掉，只能跳过。'],
      missions: [
        { text: '到达第 3 区', test: (st) => st.area >= 3 },
        { text: '单局吃 40 个水果', test: (st) => st.fruit >= 40 },
        { text: '用石斧打倒 20 个敌人', test: (st) => st.axeKills >= 20 }
      ],
      ranks: [40000, 20000, 8000]
    },
    {
      id: 'contra', title: '口袋魂斗罗', en: 'Pocket Contra', icon: '🔫', cat: 'shoot', color: '#7cc7ff', featured: true, remade: true,
      pitch: '一边跑一边自动开火，抬枪、趴下、跳跃',
      desc: '横版跑射。枪一直在打，你决定往哪打：按住 UP 斜向上射，按住 DOWN 趴下躲子弹，OK 空翻跳。打下飞行胶囊换 S 散弹、L 激光、M 机枪，关底要拆掉整面炮台墙。',
      controls: { up: '按住抬枪（斜上）', down: '按住卧倒', ok: '空翻跳' },
      tips: ['趴下能躲开大部分水平子弹。', 'BOSS 的炮口在上方，一定要抬枪。', '死亡会丢掉当前武器。'],
      missions: [
        { text: '击败第 1 关 BOSS', test: (st) => st.bosses >= 1 },
        { text: '拿到 S 散弹枪', test: (st) => st.gotS },
        { text: '单局消灭 60 个敌人', test: (st) => st.kills >= 60 }
      ],
      ranks: [50000, 25000, 10000]
    },
    {
      id: 'flappy', title: '像素飞鸟', en: 'Pixel Flappy', icon: '🐦', cat: 'casual', color: '#ffd23f', featured: true, remade: true,
      pitch: '一键扑翼，吃金币、擦管子、拿奖牌',
      desc: '经典一键扑翼，但每十根管子换一段风景：黄昏、夜晚、会上下呼吸的管子。管缝里有金币，贴着管子飞过会有擦边加分，结束时按成绩发铜银金白金奖牌。',
      controls: { up: '扑翼', down: '扑翼', ok: '扑翼' },
      tips: ['三个键都能扑翼，用最顺手的那个。', '擦边加分只看你和管子的距离。'],
      missions: [
        { text: '穿过 10 根管子', test: (st) => st.pipes >= 10 },
        { text: '穿过 40 根管子', test: (st) => st.pipes >= 40 },
        { text: '单局吃 20 枚金币', test: (st) => st.coins >= 20 }
      ],
      ranks: [6000, 3000, 1000]
    },
    {
      id: 'pawssprint', title: '短腿爪爪运动会', en: 'Paws Sprint', icon: '🐶', cat: 'race', color: '#ff8fc7', featured: true, remade: true,
      pitch: '柯基柴犬小海豹，三场杯赛争第一',
      desc: '四只小短腿同场赛跑。三条跑道换道、跳栏、躲泥坑和香蕉皮，吃骨头攒涡轮。跳起来再按一次 OK 就是空中涡轮冲刺。三场杯赛都要进前二才能捧杯。',
      controls: { up: '换到左道 · 选人', down: '换到右道 · 选人', ok: '跳 · 空中再按涡轮冲刺' },
      tips: ['踩泥坑减速，踩香蕉皮原地转圈。', '三块骨头换一次涡轮。', '涡轮冲刺可以直接撞开栏杆。'],
      missions: [
        { text: '拿到一次第一名', test: (st) => st.wins >= 1 },
        { text: '捧起奖杯（三场都进前二）', test: (st) => st.cup },
        { text: '单局吃 30 块骨头', test: (st) => st.bones >= 30 }
      ],
      ranks: [15000, 9000, 4000]
    },
    {
      id: 'match3', title: '霓虹宝石', en: 'Neon Columns', icon: '💎', cat: 'puzzle', color: '#ff5ad2', featured: true, remade: true,
      pitch: '三颗宝石往下落，横竖斜连三就消',
      desc: '三键友好的掉落式消除。三颗一组的宝石往下掉，左右移动、OK 轮换顺序，横、竖、斜连成三颗即消，掉下来再连就是连锁。每消 30 颗升一级，速度更快。',
      controls: { up: '左移', down: '右移', ok: '轮换顺序 · 按住加速下落' },
      tips: ['斜线也算！', '连锁倍率会一路叠上去。', '偶尔出现的闪光宝石会清掉它落下位置那种颜色。'],
      missions: [
        { text: '打出一次 4 连锁', test: (st) => st.maxChain >= 4 },
        { text: '单局消除 150 颗', test: (st) => st.cleared >= 150 },
        { text: '升到第 6 级', test: (st) => st.level >= 6 }
      ],
      ranks: [40000, 18000, 7000]
    },
    {
      id: 'fishhunter', title: '大鱼吃小鱼', en: 'Fish Hunter', icon: '🐟', cat: 'casual', color: '#3ee0d0', featured: true, remade: true,
      pitch: '吃比你小的，躲比你大的，长成鱼王',
      desc: '海底生存成长。小鱼一直在游，UP / DOWN 上下，OK 掉头冲刺。只能吃比自己小的鱼，连续吞食有连击，吃够就长一级。水母会让你缩小，大鲨鱼要绕着走。',
      controls: { up: '向上游', down: '向下游', ok: '掉头冲刺' },
      tips: ['鱼身边的颜色圈：绿色能吃，红色会吃你。', '冲刺期间速度翻倍，用来追猎物或逃命。', '长到 6 级就是鱼王，可以反吃鲨鱼。'],
      missions: [
        { text: '长到 4 级', test: (st) => st.level >= 4 },
        { text: '连续吞食 12 条', test: (st) => st.maxCombo >= 12 },
        { text: '成为鱼王', test: (st) => st.level >= 6 }
      ],
      ranks: [20000, 9000, 3000]
    },
    {
      id: 'cyberrunner', title: '赛博信使', en: 'Cyber Runner', icon: '⚡', cat: 'action', color: '#b58cff', featured: true, remade: true,
      pitch: '屋顶跑酷，影刃冲刺斩无人机',
      desc: '霓虹城市屋顶上的跑酷。OK 跳（可二段跳），DOWN 滑铲钻栏杆、空中按是急坠，UP 影刃冲刺能斩开无人机，斩中立刻回满冲刺。越跑越快。',
      controls: { up: '影刃冲刺', down: '滑铲 · 空中急坠', ok: '跳跃 · 二段跳' },
      tips: ['冲刺斩中无人机会刷新冲刺和二段跳。', '红色激光栏只能滑过去。', '楼缝前先跳，别等到边缘。'],
      missions: [
        { text: '单局跑过 1500m', test: (st) => st.dist >= 1500 },
        { text: '单局斩杀 20 架无人机', test: (st) => st.kills >= 20 },
        { text: '连斩 5 架不落地', test: (st) => st.maxChain >= 5 }
      ],
      ranks: [30000, 15000, 6000]
    },
    {
      id: 'pong', title: '变异乒乓', en: 'Mutant Pong', icon: '🏓', cat: 'casual', color: '#5eead4', remade: true,
      pitch: '三个对手，七分一局，球会变异',
      desc: '竖版乒乓。球靠近球拍时按 OK 是扣杀，时机越准球越快。球撞到中场的变异方块会变大、分裂、拐弯或加速。连续赢下三个越来越强的对手就通关。',
      controls: { up: '球拍左移', down: '球拍右移', ok: '扣杀（球到拍前时按）' },
      tips: ['用球拍边缘接球会打出角度。', '扣杀窗口在球拍上方一小段，出现白圈就是时机。'],
      missions: [
        { text: '赢下一局', test: (st) => st.wins >= 1 },
        { text: '打出 10 次完美扣杀', test: (st) => st.perfect >= 10 },
        { text: '击败全部 3 个对手', test: (st) => st.wins >= 3 }
      ],
      ranks: [12000, 7000, 3000]
    },
    {
      id: 'bouncy', title: '几何弹射', en: 'Bouncy Blaster', icon: '🎯', cat: 'puzzle', color: '#8b8bff', remade: true,
      pitch: '十二关弹球谜题，算好反弹一发入魂',
      desc: '台球加神枪手。弹球会在墙和钢板上反弹，瞄准线会预告前两次反弹。子弹有限，打掉所有红色目标过关，炸药桶会连带炸掉周围的东西。',
      controls: { up: '逆时针瞄准', down: '顺时针瞄准', ok: '发射' },
      tips: ['按住方向键会越转越快，点按是精调。', '剩余子弹越多，过关分越高。', '蓝色镜面会把球折成直角。'],
      missions: [
        { text: '通过第 4 关', test: (st) => st.level >= 5 },
        { text: '一发击倒 3 个目标', test: (st) => st.multi >= 3 },
        { text: '全部 12 关通关', test: (st) => st.clear }
      ],
      ranks: [30000, 20000, 10000]
    },
    {
      id: 'splasher', title: '水枪狂欢节', en: 'Hydro Splash', icon: '💦', cat: 'shoot', color: '#22d3ee', remade: true, time: 60,
      pitch: '给灰扑扑的打工人一身彩色',
      desc: '六十秒水枪射击馆。窗口和街上会冒出灰扑扑的打工人，抛物线水弹命中就变成夏威夷衬衫跳舞。连续命中有连击，别误伤猫猫。',
      controls: { up: '抬高枪口', down: '压低枪口', ok: '发射水弹 · 按住连射' },
      tips: ['水弹是抛物线，远处要抬高。', '金色的老板值 5 倍分。', '打到猫会断连击。'],
      missions: [
        { text: '单局染色 25 人', test: (st) => st.hits >= 25 },
        { text: '连击 10 次', test: (st) => st.maxCombo >= 10 },
        { text: '单局得分 8000', test: (st) => st.score >= 8000 }
      ],
      ranks: [12000, 7000, 3500]
    },
    {
      id: 'lasercat', title: '猫猫激光笔', en: 'Laser Cat', icon: '🐱', cat: 'puzzle', color: '#ff6b6b', remade: true,
      pitch: '用红点指挥猫，把电池箱推进插槽',
      desc: '猫会追着红点飞扑。转动激光笔，按住 OK 打出红点，猫扑过去会把箱子撞开。把电池箱推进插槽就过关，一共八个房间。',
      controls: { up: '激光左转', down: '激光右转', ok: '按住打出红点' },
      tips: ['猫扑的方向就是箱子被推的方向。', '松开 OK 猫会停下来，用来微调。', '步数越少分越高。'],
      missions: [
        { text: '通过第 3 个房间', test: (st) => st.level >= 4 },
        { text: '20 秒内过一关', test: (st) => st.fast },
        { text: '八个房间全通', test: (st) => st.clear }
      ],
      ranks: [20000, 12000, 6000]
    },

    {
      id: 'gearcavalry', title: '齿轮骑兵', en: 'Gear Cavalry', icon: '⚙️', cat: 'action', color: '#fbbf24', remade: true,
      pitch: '骑枪冲锋，看敌人出招：戳、刺、铲',
      desc: '蒸汽朋克横版冲锋。普通兵用骑枪戳，举盾的要跳起来下刺，贴地的机械蜘蛛要滑铲碾过去，滚来的油桶跳过去。连击攒蒸汽，满压自动过载横冲直撞；每 900 米有一只铁巨人，核心发光时才打得动。',
      controls: { up: '跃马 · 空中再按二段跳', down: '滑铲 · 空中下刺', ok: '骑枪突刺' },
      tips: ['举盾兵正面戳不动，从头顶下刺。', '下刺落地会震飞身边的敌人。', '过载期间撞到什么都算你赢。'],
      missions: [
        { text: '单局连击 15 次', test: (st) => st.maxCombo >= 15 },
        { text: '击倒一只铁巨人', test: (st) => st.bosses >= 1 },
        { text: '冲过 2000m', test: (st) => st.dist >= 2000 }
      ],
      ranks: [60000, 25000, 8000]
    },
    {
      id: 'flydriver', title: '果蝇超跑', en: 'Fly Driver', icon: '🚀', cat: 'race', color: '#a5b4fc', featured: true, remade: true,
      pitch: '管道隧道里 360° 绕圈狂飙',
      desc: '光速隧道竞速。飞船贴着圆管内壁飞，UP / DOWN 沿着管壁转圈，整个世界跟着旋转。一圈圈障碍环迎面扑来，找缺口钻过去；贴着障碍擦过能攒能量，按住 OK 用能量加速。',
      controls: { up: '沿管壁逆时针转', down: '沿管壁顺时针转', ok: '按住加速' },
      tips: ['点一下转一格，按住连续转。', '擦边比躲远更赚：分数和能量都会涨。', '三次护盾用完就结束。'],
      missions: [
        { text: '飞过 3000m', test: (st) => st.dist >= 3000 },
        { text: '单局擦边 20 次', test: (st) => st.nearMiss >= 20 },
        { text: '吃到 15 个能量球', test: (st) => st.orbs >= 15 }
      ],
      ranks: [20000, 10000, 4000]
    },
    {
      id: 'flysaber', title: '果蝇光剑', en: 'Fly Saber', icon: '⚔️', cat: 'rhythm', color: '#fb7185', featured: true, remade: true,
      pitch: '跟着音乐砍方块，三首曲子越来越快',
      desc: '节奏劈砍。游戏自带合成音乐，方块踩着节拍飞过来：蓝色按 UP、红色按 DOWN、金色按 OK，踩准判定线是 PERFECT。别砍黑色炸弹。连击越长倍率越高，三首曲子全部打完就通关。',
      controls: { up: '蓝刀（左）', down: '红刀（右）', ok: '劈金色核心（中）' },
      tips: ['跟着鼓点按，比盯着方块更准。', 'PERFECT 会回一点同步值。', '炸弹直接放过就好。'],
      missions: [
        { text: '打完第一首', test: (st) => st.songs >= 1 },
        { text: '单局 50 连击', test: (st) => st.maxCombo >= 50 },
        { text: '三首全部通关', test: (st) => st.songs >= 3 }
      ],
      ranks: [60000, 35000, 15000]
    },
    {
      id: 'wave', title: '浪涌漫游者', en: 'Wave Walker', icon: '🦦', cat: 'race', color: '#38bdf8', remade: true,
      pitch: '一键冲浪：下坡按住，浪尖松手飞起来',
      desc: '海獭冲浪。下坡时按住 OK 压板加速，冲到浪尖松手就会飞起来；在空中用 UP / DOWN 翻跟头，落水时板子和浪面对齐才算完美，完美落水连起来越来越快。太阳会慢慢落下，冲过浮标能续上白天。',
      controls: { up: '空中向后翻', down: '空中向前翻', ok: '按住压板（下坡加速）' },
      tips: ['上坡别按，按了会减速。', '空翻越多分越高，但落水角度不对会翻车。', '速度越快越容易赶上下一个浮标。'],
      missions: [
        { text: '单局完成 5 个空翻', test: (st) => st.flips >= 5 },
        { text: '单局 10 次完美落水', test: (st) => st.perfect >= 10 },
        { text: '冲出 1500m', test: (st) => st.dist >= 1500 }
      ],
      ranks: [30000, 15000, 6000]
    },
    {
      id: 'wind', title: '风与纸翼', en: 'Wind Rider', icon: '🪁', cat: 'casual', color: '#2dd4bf', remade: true,
      pitch: '纸飞机滑翔：俯冲换速度，拉起换高度',
      desc: '纸飞机滑翔。UP 抬头、DOWN 压头：往下冲会越来越快，拉起来会越飞越高但会变慢。穿过金色风环能加速，绿色上升气流会把你托起来，雷云会劈掉一半速度。OK 放出一阵顺风。贴着地面滑行会越来越慢，停下来就结束。',
      controls: { up: '抬起机头', down: '压低机头', ok: '顺风（3 次）' },
      tips: ['快失速时压低机头换速度。', '每连穿 3 个风环回一次顺风。', '上升气流里可以放心拉高。'],
      missions: [
        { text: '单局穿过 20 个风环', test: (st) => st.rings >= 20 },
        { text: '连续穿 8 个风环', test: (st) => st.maxChain >= 8 },
        { text: '飞出 1500m', test: (st) => st.dist >= 1500 }
      ],
      ranks: [8000, 4000, 1500]
    },
    {
      id: 'bubble', title: '飞针破泡', en: 'Bubble Shooter', icon: '🫧', cat: 'puzzle', color: '#38bdf8', remade: true,
      pitch: '打泡泡：三个同色就爆，吊着的整片掉',
      desc: '泡泡射手。调好角度发射泡泡，碰到的地方就粘住；三个以上同色连在一起就会爆掉，失去支撑的整片泡泡跟着掉下来，掉得越多分越高。连续几发没打爆，天花板就会往下压一行，压过红线就输。清空整屏进下一关。',
      controls: { up: '向左调角度', down: '向右调角度', ok: '发射' },
      tips: ['瞄准线会显示一次撞墙反弹。', '打掉"吊点"能让下面一大片一起掉。', '左下角的格子是离天花板下压还剩几发。'],
      missions: [
        { text: '一次掉落 8 个泡泡', test: (st) => st.maxDrop >= 8 },
        { text: '打到第 3 关', test: (st) => st.level >= 3 },
        { text: '单局打爆 150 个', test: (st) => st.popped >= 150 }
      ],
      ranks: [40000, 18000, 7000]
    },
    {
      id: 'huddle', title: '午后温泉', en: 'Fluffy Huddle', icon: '♨️', cat: 'puzzle', color: '#f472b6', featured: true, remade: true,
      pitch: '萌物合成：两只一样的碰到就抱成更大的',
      desc: '温泉合成。把小动物一只只放进木桶温泉，两只一样的碰到一起就会抱成更大的一只：小鸡、仓鼠、猫咪、柴犬、海豹、熊猫、水豚，最后是大白熊。大白熊不会再合成，只会越来越挤。连着抱团有连击。温泉挤到红线以上太久就结束。',
      controls: { up: '向左移动', down: '向右移动', ok: '放下' },
      tips: ['大的放两边，小的放中间。', '留一个空位等同款掉进去。', '右上角能看到下一只是谁。'],
      missions: [
        { text: '抱出一只熊猫', test: (st) => st.best >= 5 },
        { text: '抱出一只水豚', test: (st) => st.best >= 6 },
        { text: '单局合成 80 次', test: (st) => st.merges >= 80 }
      ],
      ranks: [25000, 12000, 5000]
    },
    {
      id: 'smash', title: '万物皆可敲', en: 'Smash Frenzy', icon: '🔨', cat: 'rhythm', color: '#fb923c', featured: true, remade: true,
      pitch: '三个洞三颗键：敲闹钟、敲打卡机，别敲小猫',
      desc: '三洞打地鼠。左中右三个洞正好对应 UP、OK、DOWN。闹钟、周一打卡机、蚊子、鸡蛋冒出来就敲，金猪值五倍；小猫是来玩的，别敲它。东西溜走或者敲到小猫都会扣心。连击每满 20 进入狂热模式，分数翻倍。',
      controls: { up: '敲左边', down: '敲右边', ok: '敲中间' },
      tips: ['冒出来的东西头上有倒计时圈。', '敲空洞会断连击。', '后面会两个洞一起冒。'],
      missions: [
        { text: '单局 30 连击', test: (st) => st.maxCombo >= 30 },
        { text: '进入一次狂热模式', test: (st) => st.fevers >= 1 },
        { text: '单局敲中 100 次', test: (st) => st.hits >= 100 }
      ],
      ranks: [40000, 18000, 6000]
    },
    {
      id: 'roulette', title: '恶魔轮盘', en: 'Devil Roulette', icon: '🎰', cat: 'casual', color: '#ff6b6b', remade: true,
      pitch: '公布子弹数，轮流开枪，还有五种道具',
      desc: '霰弹心理战。每轮先公布几发实弹几发空包，再打乱装膛。你可以朝恶魔开枪，也可以赌空包朝自己开枪换一个额外回合。放大镜、锯子、啤酒、香烟、手铐各有用处，连赢三个恶魔就通关。',
      controls: { up: '上一个选项', down: '下一个选项', ok: '确认' },
      tips: ['记住已经打出去几发实弹，剩下的概率自己算。', '确定是空包时朝自己开枪，白赚一回合。', '锯子配放大镜：确认是实弹再锯。'],
      missions: [
        { text: '击败第一个恶魔', test: (st) => st.wins >= 1 },
        { text: '单局朝自己打出 3 发空包', test: (st) => st.selfBlank >= 3 },
        { text: '击败全部 3 个恶魔', test: (st) => st.clear }
      ],
      ranks: [12000, 7000, 3000]
    },
    {
      id: 'fish', title: '会躲起来的鱼', en: 'Shy Fish', icon: '🐠', cat: 'casual', color: '#67e8f9', remade: true,
      pitch: '小金鱼钻进贝壳，贝壳换位，猜它在哪',
      desc: '猜猜鱼在哪。盯住小金鱼钻进哪个贝壳，三个贝壳会飞快地互换位置，停下后用 UP / OK / DOWN 选左中右。每轮换得更多更快，第 4 轮起还会有一条冒充的红鱼。',
      controls: { up: '选左边', down: '选右边', ok: '选中间' },
      tips: ['只盯一个贝壳，别看全局。', '前几轮鱼会吐泡泡露馅。', '答得越快分越高。'],
      missions: [
        { text: '撑到第 5 轮', test: (st) => st.round >= 5 },
        { text: '连续猜中 6 次', test: (st) => st.maxStreak >= 6 },
        { text: '撑到第 12 轮', test: (st) => st.round >= 12 }
      ],
      ranks: [15000, 7000, 2500]
    },
    {
      id: 'sparkler', title: '仙女棒', en: 'Firework Night', icon: '🎆', cat: 'rhythm', color: '#fdba74', featured: true, remade: true,
      pitch: '烟花大会：飞到光圈里再按，越准越大',
      desc: '烟花大会。左中右三根发射筒对应 UP、OK、DOWN，烟花飞进光圈时按对应的键就会炸开，按得越准烟花越大。连续完美会攒满压轴条，放出一整片压轴大烟花。错过五发哑炮就结束。',
      controls: { up: '点左边', down: '点右边', ok: '点中间' },
      tips: ['光圈变黄就是时机。', '后面会两根筒一起发射。', '连续命中倍率会涨到 6 倍。'],
      missions: [
        { text: '单局 20 次完美', test: (st) => st.perfect >= 20 },
        { text: '放出一次压轴烟花', test: (st) => st.finales >= 1 },
        { text: '单局 30 连发', test: (st) => st.maxCombo >= 30 }
      ],
      ranks: [30000, 12000, 4000]
    },
    {
      id: 'worldtime', title: '世界时钟', en: 'Time Zone Quiz', icon: '🕰️', cat: 'puzzle', color: '#fde047', remade: true,
      pitch: '时差大挑战：北京几点，纽约几点？',
      desc: '时差问答。看着北京时间，答出别的城市现在几点、谁正是白天、谁最先跨年。三个选项对应 UP / OK / DOWN，越快答对分越高，连对还有倍率。答错三次结束。',
      controls: { up: '选第一个', down: '选第三个', ok: '选第二个' },
      tips: ['往东每 15 度早一小时。', '北京是 UTC+8，伦敦是 UTC+0。', '题目按标准时间，不算夏令时。'],
      missions: [
        { text: '连续答对 5 题', test: (st) => st.maxStreak >= 5 },
        { text: '单局答对 15 题', test: (st) => st.correct >= 15 },
        { text: '单局得分 8000', test: (st) => st.score >= 8000 }
      ],
      ranks: [12000, 6000, 2500]
    }
  ];
})(window);
