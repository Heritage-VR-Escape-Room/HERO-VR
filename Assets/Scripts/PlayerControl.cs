
using UnityEngine;
using UnityEngine.InputSystem;

[RequireComponent(typeof(CharacterController))]
public class PlayerController : MonoBehaviour
{
    [Header("Movement")]
    [SerializeField] private float moveSpeed = 4f;
    [SerializeField] private float gravity = -9.81f;

    [Header("Camera")]
    [SerializeField] private Transform playerCamera;
    [SerializeField] private float mouseSensitivity = 0.15f;

    [Header("Input")]
    [SerializeField] private InputActionReference moveAction;
    [SerializeField] private InputActionReference lookAction;

    private CharacterController controller;
    private float verticalVelocity;
    private float cameraPitch;

    private void Awake()
    {
        controller = GetComponent<CharacterController>();
    }

    private void OnEnable()
    {
        moveAction?.action?.Enable();
        lookAction?.action?.Enable();
    }

    private void OnDisable()
    {
        moveAction?.action?.Disable();
        lookAction?.action?.Disable();
    }

    private void Start()
    {
        Cursor.lockState = CursorLockMode.Locked;
        Cursor.visible = false;
    }

    private void Update()
    {
        // Mouse look
        if (Keyboard.current != null &&
            Keyboard.current.escapeKey.wasPressedThisFrame)
        {
            Cursor.lockState = CursorLockMode.None;
            Cursor.visible = true;
        }

        if (Mouse.current != null &&
            Mouse.current.leftButton.wasPressedThisFrame)
        {
            Cursor.lockState = CursorLockMode.Locked;
            Cursor.visible = false;
        }

        if (Cursor.lockState == CursorLockMode.Locked &&
            playerCamera != null && lookAction != null)
        {
            Vector2 look = lookAction.action.ReadValue<Vector2>();

            transform.Rotate(Vector3.up *
                look.x * mouseSensitivity);

            cameraPitch -= look.y * mouseSensitivity;
            cameraPitch = Mathf.Clamp(cameraPitch, -80f, 80f);

            playerCamera.localRotation =
                Quaternion.Euler(cameraPitch, 0f, 0f);
        }

        // WASD movement
        Vector2 input = moveAction != null
            ? moveAction.action.ReadValue<Vector2>()
            : Vector2.zero;

        Vector3 direction =
            transform.right * input.x +
            transform.forward * input.y;

        direction = Vector3.ClampMagnitude(direction, 1f);

        // Gravity
        if (controller.isGrounded && verticalVelocity < 0f)
        {
            verticalVelocity = -2f;
        }

        verticalVelocity += gravity * Time.deltaTime;

        Vector3 velocity = direction * moveSpeed;
        velocity.y = verticalVelocity;

        controller.Move(velocity * Time.deltaTime);
    }
}
