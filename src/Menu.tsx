import * as React from 'react';

import {
  Animated,
  Dimensions,
  Easing,
  Modal,
  Platform,
  StyleSheet,
  TouchableWithoutFeedback,
  View,
  NativeMethods,
  StyleProp,
  ViewStyle,
  LayoutChangeEvent
} from 'react-native';

export enum Position {
  TOP_LEFT,
  TOP_RIGHT,
  TOP_CENTER,
  BOTTOM_LEFT,
  BOTTOM_RIGHT,
  BOTTOM_CENTER
}

export interface Offset {
  top?: number;
  left?: number;
  right?: number;
  bottom?: number;
}

export type ComputeOffsetCallback =
  | ((left: number, top: number, width: number, height: number) => Offset)
  | null;

const ANIMATION_DURATION = 300;
const EASING = Easing.bezier(0.4, 0, 0.2, 1);
const SCREEN_INDENT = 8;

const enum STATES {
  MEASURING,
  CALCULATING,
  SHOWN,
  HIDDEN,
  ANIMATING
}

type PositionShift = {
  left: number;
  top: number;
};

interface ComponentLayout {
  left: number;
  top: number;
  width: number;
  height: number;
}

const normalizeOffset = (extraOffset: Offset): PositionShift => {
  const reducer = (
    { left, top }: { left: number; top: number },
    [prop, value]: [string, number]
  ) => {
    if (prop === 'left') {
      left += value;
    } else if (prop === 'right') {
      left -= value;
    } else if (prop === 'top') {
      top += value;
    } else if (prop === 'bottom') {
      top -= value;
    }
    return { left, top };
  };

  return Object.entries(extraOffset).reduce(reducer, { left: 0, top: 0 });
};

const getSummarizedOffset = (offsetList: PositionShift[]) => {
  const reducer = (acc: PositionShift, { left, top }: PositionShift) => ({
    left: acc.left + left,
    top: acc.top + top
  });
  return offsetList.reduce(reducer, { left: 0, top: 0 });
};

const getMenuOffset = (
  stickTo: Position,
  component: ComponentLayout,
  menu: ComponentLayout
): PositionShift => {
  if (stickTo === Position.TOP_RIGHT) {
    const left = component.left + (component.width - menu.width);
    const top = component.top;
    return { left, top };
  } else if (stickTo === Position.BOTTOM_LEFT) {
    const left = component.left;
    const top = component.top + component.height;
    return { left, top };
  } else if (stickTo === Position.BOTTOM_RIGHT) {
    const left = component.left + (component.width - menu.width);
    const top = component.top + component.height;
    return { left, top };
  } else if (stickTo === Position.TOP_LEFT) {
    const left = component.left;
    const top = component.top;
    return { left, top };
  } else if (stickTo === Position.TOP_CENTER) {
    const left =
      component.left + Math.round((component.width - menu.width) / 2);
    const top = component.top;
    return { left, top };
  } else if (stickTo === Position.BOTTOM_CENTER) {
    const left =
      component.left + Math.round((component.width - menu.width) / 2);
    const top = component.top + component.height;
    return { left, top };
  }

  return { left: 0, top: 0 };
};

const getComputedOffset = (
  func: ComputeOffsetCallback,
  left: number,
  top: number,
  width: number,
  height: number
) => {
  if (func) {
    const extraOffset = func(left, top, width, height);
    return normalizeOffset(extraOffset);
  }
  return null;
};

interface Props {
  testID?: string;
  style?: StyleProp<ViewStyle>;
  onHidden?: () => {};
}

interface State {
  menuState: STATES;
  stickTo: Position;
  component: ComponentLayout;
  menu: ComponentLayout;
  offsets: {
    staticOffset: PositionShift;
    computedOffset: PositionShift;
  };
  animation: {
    menuSize: Animated.ValueXY;
    opacity: Animated.Value;
  };
}

export class Menu extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);

    this.state = {
      menuState: STATES.HIDDEN,
      stickTo: Position.TOP_LEFT,
      component: {
        left: 0,
        top: 0,
        width: 0,
        height: 0
      },
      menu: {
        left: 0,
        top: 0,
        width: 0,
        height: 0
      },
      offsets: {
        staticOffset: {
          left: 0,
          top: 0
        },
        computedOffset: {
          left: 0,
          top: 0
        }
      },
      animation: {
        menuSize: new Animated.ValueXY({ x: 0, y: 0 }),
        opacity: new Animated.Value(0)
      }
    };
  }

  componentDidUpdate() {
    const { menuState, menu } = this.state;

    if (menuState === STATES.ANIMATING) {
      return;
    }
    if (menuState === STATES.CALCULATING) {
      const { stickTo, component, offsets } = this.state;

      const baseOffset = getMenuOffset(stickTo, component, menu);
      const allOffsets = [
        baseOffset,
        offsets.staticOffset,
        offsets.computedOffset
      ];
      const finalOffset = getSummarizedOffset(allOffsets);
      this.setState({
        menuState: STATES.SHOWN,
        menu: {
          ...menu,
          left: finalOffset.left,
          top: finalOffset.top
        }
      });
    } else if (menuState === STATES.SHOWN) {
      const { animation } = this.state;
      this.setState(
        {
          menuState: STATES.ANIMATING
        },
        () => {
          Animated.parallel([
            Animated.timing(animation.menuSize, {
              toValue: { x: menu.width, y: menu.height },
              duration: ANIMATION_DURATION,
              easing: EASING,
              useNativeDriver: false
            }),
            Animated.timing(animation.opacity, {
              toValue: 1,
              duration: ANIMATION_DURATION,
              easing: EASING,
              useNativeDriver: false
            })
          ]).start();
        }
      );
    }
  }

  show = (
    componentRef: React.RefObject<
      React.Component<any> & Readonly<NativeMethods>
    >['current'],
    stickTo: Position | null = null,
    extraOffset: Offset | null = null,
    computeOffset: ComputeOffsetCallback = null
  ) => {
    if (componentRef !== null) {
      componentRef.measureInWindow(
        (x: number, y: number, width: number, height: number) => {
          const top = Math.max(SCREEN_INDENT, y);
          const left = Math.max(SCREEN_INDENT, x);

          const computedOffset = getComputedOffset(
            computeOffset,
            left,
            top,
            width,
            height
          );
          const oldOffsets = { ...this.state.offsets };
          const newState: Pick<State, 'menuState' | 'component' | 'offsets'> = {
            menuState: STATES.MEASURING,
            component: { left, top, width, height },
            offsets: {
              ...oldOffsets,
              ...(extraOffset
                ? { staticOffset: normalizeOffset(extraOffset) }
                : {}),
              ...(computedOffset ? { computedOffset } : {})
            },
            ...(stickTo ? { stickTo } : {})
          };
          this.setState(newState);
        }
      );
    }
  };

  /* Measure new menu width and height */
  _onMenuLayout = (event: LayoutChangeEvent): void => {
    const { width, height } = event.nativeEvent.layout;
    const { menuState, menu } = this.state;

    if (menuState === STATES.MEASURING) {
      this.setState({
        menuState: STATES.CALCULATING,
        menu: {
          ...menu,
          width,
          height
        }
      });
    }
  };

  _onDismiss = () => {
    if (this.props.onHidden) {
      this.props.onHidden();
    }
  };

  hide = () => {
    const { animation } = this.state;
    this.props.onHidden();
    Animated.timing(this.state.animation.opacity, {
      toValue: 0,
      duration: ANIMATION_DURATION,
      easing: EASING,
      useNativeDriver: false
    }).start(() => {
      /* Reset state */
      this.setState(
        {
          menuState: STATES.HIDDEN,
          animation: {
            ...animation,
            menuSize: new Animated.ValueXY({ x: 0, y: 0 }),
            opacity: new Animated.Value(0)
          }
        },
        () => {
          /* Invoke onHidden callback if defined */
          if (Platform.OS !== 'ios' && this.props.onHidden) {
            this.props.onHidden();
          }
        }
      );
    });
  };

  render() {
    const dimensions = Dimensions.get('screen');
    const { menu, component, animation } = this.state;
    const menuSize = {
      width: animation.menuSize.x,
      height: animation.menuSize.y
    };

    /* Adjust position of menu */
    const transforms = [];

    /* Flip by X axis if menu hits right screen border */
    if (menu.left > dimensions.width - menu.width - SCREEN_INDENT) {
      transforms.push({
        translateX: Animated.multiply(animation.menuSize.x, -1)
      });

      menu.left = Math.min(
        dimensions.width - SCREEN_INDENT,
        menu.left + component.width
      );
    }

    /* Flip by Y axis if menu hits bottom screen border */
    if (menu.top > dimensions.height - menu.height - SCREEN_INDENT) {
      transforms.push({
        translateY: Animated.multiply(animation.menuSize.y, -1)
      });

      menu.top = Math.min(
        dimensions.height - SCREEN_INDENT,
        menu.top + component.height
      );
    }

    const shadowMenuContainerStyle = {
      opacity: animation.opacity,
      transform: transforms,
      left: menu.left,
      top: menu.top
    };

    const { menuState } = this.state;
    const animationStarted = menuState === STATES.ANIMATING;
    const modalVisible =
      menuState === STATES.MEASURING ||
      menuState === STATES.CALCULATING ||
      menuState === STATES.SHOWN ||
      animationStarted;

    const { testID, style, children, accessible } = this.props;

    return (
      <View collapsable={false} testID={testID} accessible={accessible}>
        <Modal
          accessible={accessible}
          visible={modalVisible}
          onRequestClose={this.hide}
          supportedOrientations={[
            'portrait',
            'portrait-upside-down',
            'landscape',
            'landscape-left',
            'landscape-right'
          ]}
          transparent
          onDismiss={this._onDismiss}
        >
          <TouchableWithoutFeedback onPress={this.hide} accessible={accessible}>
            <View style={StyleSheet.absoluteFill} accessible={accessible}>
              <Animated.View
                {...(!animationStarted ? { onLayout: this._onMenuLayout } : {})}
                style={[
                  styles.shadowMenuContainer,
                  shadowMenuContainerStyle,
                  style
                ]}
                accessible={accessible}
              >
                <Animated.View
                  style={[styles.menuContainer, animationStarted && menuSize]}
                  accessible={accessible}
                >
                  {children}
                </Animated.View>
              </Animated.View>
            </View>
          </TouchableWithoutFeedback>
        </Modal>
      </View>
    );
  }
}

const styles = StyleSheet.create({
  shadowMenuContainer: {
    position: 'absolute',
    backgroundColor: 'white',
    borderRadius: 4,
    opacity: 0,

    /* Shadow */
    ...Platform.select({
      ios: {
        shadowColor: 'black',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.14,
        shadowRadius: 2
      },
      android: {
        elevation: 8
      }
    })
  },
  menuContainer: {
    overflow: 'hidden'
  }
});
